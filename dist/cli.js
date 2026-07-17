#!/usr/bin/env node

// src/cli.ts
import { appendFile, mkdir, readFile as readFile3, writeFile } from "fs/promises";
import { dirname as dirname2, join as join2, resolve as resolve3 } from "path";
import { Command } from "commander";
import { stringify } from "yaml";

// src/load.ts
import { readFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import fg from "fast-glob";
import { parse } from "yaml";

// src/schema.ts
import { z } from "zod";
var dimensionIds = [
  "context",
  "environment",
  "specification",
  "tooling",
  "security",
  "testing",
  "governance",
  "learning",
  "observability",
  "resilience"
];
var DimensionIdSchema = z.enum(dimensionIds);
var LevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
var PathAnySchema = z.object({
  type: z.literal("path_any"),
  patterns: z.array(z.string().min(1)).min(1)
});
var PathAllSchema = z.object({
  type: z.literal("path_all"),
  patterns: z.array(z.string().min(1)).min(1)
});
var ContentAnySchema = z.object({
  type: z.literal("content_any"),
  files: z.array(z.string().min(1)).min(1),
  needles: z.array(z.string().min(1)).min(1)
});
var ContentAllSchema = z.object({
  type: z.literal("content_all"),
  files: z.array(z.string().min(1)).min(1),
  needles: z.array(z.string().min(1)).min(1)
});
var MaxBytesSchema = z.object({
  type: z.literal("max_bytes"),
  patterns: z.array(z.string().min(1)).min(1),
  max_bytes: z.number().int().positive()
});
var ManualSchema = z.object({
  type: z.literal("manual"),
  prompt: z.string().min(1)
});
var EvidenceCheckSchema = z.discriminatedUnion("type", [
  PathAnySchema,
  PathAllSchema,
  ContentAnySchema,
  ContentAllSchema,
  MaxBytesSchema,
  ManualSchema
]);
var RawControlSchema = z.object({
  id: z.string().regex(/^ADRB-[A-Z]{3}-\d{3}$/),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  title: z.string().min(1),
  outcome: z.string().min(1),
  risk: z.string().min(1),
  evidence: z.array(EvidenceCheckSchema).min(1),
  remediation: z.string().min(1),
  references: z.array(z.string().min(1)).default([]),
  allow_attestation: z.boolean().default(true),
  allow_not_applicable: z.boolean().default(false)
});
var ControlFileSchema = z.object({
  dimension: DimensionIdSchema,
  controls: z.array(RawControlSchema).min(1)
});
var DimensionSchema = z.object({
  id: DimensionIdSchema,
  title: z.string().min(1),
  description: z.string().min(1)
});
var FloorsSchema = z.object(
  Object.fromEntries(dimensionIds.map((dimension) => [dimension, LevelSchema]))
);
var ReadinessProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  description: z.string().min(1),
  floors: FloorsSchema
});
var BenchmarkSchema = z.object({
  id: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: z.string().min(1),
  description: z.string().min(1),
  maturity_levels: z.record(z.string(), z.string()),
  dimensions: z.array(DimensionSchema).length(dimensionIds.length),
  readiness_profiles: z.array(ReadinessProfileSchema).min(1),
  scoring: z.object({
    dimension_method: z.literal("consecutive-levels"),
    overall_method: z.literal("sum"),
    maximum_score: z.literal(40),
    readiness_method: z.literal("non-compensating-floors"),
    attestation_counts_as_verified: z.literal(false)
  })
});
var AttestationStatusSchema = z.enum(["met", "not_met", "not_applicable", "unknown"]);
var AttestationSchema = z.object({
  status: AttestationStatusSchema,
  evidence: z.string().min(1),
  owner: z.string().min(1),
  reviewed_at: z.string().date(),
  expires_at: z.string().date().nullable().default(null)
});
var AttestationFileSchema = z.object({
  benchmark_version: z.string().min(1),
  attestations: z.record(z.string(), AttestationSchema).default({})
});

// src/load.ts
var packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
var defaultBenchmarkRoot = join(packageRoot, "benchmark", "v0.1");
async function readYaml(path) {
  return parse(await readFile(path, "utf8"));
}
async function loadBenchmark(root = defaultBenchmarkRoot) {
  const benchmark = BenchmarkSchema.parse(await readYaml(join(root, "benchmark.yaml")));
  const controlPaths = await fg("controls/*.yaml", { cwd: root, absolute: true, onlyFiles: true });
  const controls = [];
  for (const path of controlPaths.sort()) {
    const file = ControlFileSchema.parse(await readYaml(path));
    controls.push(...file.controls.map((control) => ({ ...control, dimension: file.dimension })));
  }
  validateCatalog(benchmark, controls);
  return { benchmark, controls };
}
async function loadAttestations(path, benchmarkVersion) {
  try {
    const file = AttestationFileSchema.parse(await readYaml(path));
    if (file.benchmark_version !== benchmarkVersion) {
      throw new Error(
        `Attestation benchmark version ${file.benchmark_version} does not match ${benchmarkVersion}`
      );
    }
    return file;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function validateCatalog(benchmark, controls) {
  const ids = /* @__PURE__ */ new Set();
  for (const control of controls) {
    if (ids.has(control.id)) throw new Error(`Duplicate control id: ${control.id}`);
    ids.add(control.id);
  }
  const benchmarkDimensions = benchmark.dimensions.map(({ id }) => id);
  if (benchmarkDimensions.join(",") !== dimensionIds.join(",")) {
    throw new Error("Benchmark dimensions must use the canonical order and complete dimension set");
  }
  for (const dimension of dimensionIds) {
    for (const level of [1, 2, 3, 4]) {
      const count = controls.filter(
        (control) => control.dimension === dimension && control.level === level
      ).length;
      if (count === 0) throw new Error(`Dimension ${dimension} has no level ${level} control`);
    }
  }
}

// src/report.ts
var statusIcon = {
  met: "PASS",
  not_met: "FAIL",
  unknown: "UNKNOWN",
  not_applicable: "N/A"
};
function toMarkdown(report) {
  const target = report.profiles.find(({ id }) => id === report.target.profile);
  const lines = [
    "# Agentic Development Readiness Assessment",
    "",
    `- Benchmark: ${report.benchmark.id} v${report.benchmark.version}`,
    `- Repository: \`${report.target.repository}\``,
    `- Assessed: ${report.assessed_at}`,
    `- Score: **${report.score.total}/${report.score.maximum} (${report.score.percentage}%)**`,
    `- Highest readiness profile: **${report.readiness.highest_profile ?? "none"}**`,
    `- Target \`${report.target.profile}\`: **${report.readiness.target_passed ? "PASS" : "FAIL"}**`,
    `- Evidence: ${report.evidence_summary.verified} verified, ${report.evidence_summary.attested} attested, ${report.evidence_summary.unmet_or_unknown} unmet/unknown`,
    "",
    "## Dimensions",
    "",
    "| Dimension | Score | Controls met |",
    "| --- | ---: | ---: |",
    ...report.dimensions.map(
      ({ title, score, controls_met: met, controls_total: total }) => `| ${title} | ${score}/4 | ${met}/${total} |`
    )
  ];
  if (target && !target.passed) {
    lines.push("", "## Target-profile blockers", "");
    for (const blocker of target.blockers) {
      lines.push(
        `- **${blocker.dimension}:** ${blocker.actual}/4; requires ${blocker.required}/4 (${blocker.control_ids.join(", ") || "lower-level gap"})`
      );
    }
  }
  lines.push("", "## Controls requiring action", "");
  const actionControls = report.controls.filter(
    ({ status }) => status === "not_met" || status === "unknown"
  );
  if (actionControls.length === 0) {
    lines.push("None.");
  } else {
    for (const control of actionControls) {
      lines.push(
        `### ${statusIcon[control.status]} ${control.id} \u2014 ${control.title}`,
        "",
        `**Risk:** ${control.risk}`,
        "",
        `**Improve:** ${control.remediation}`,
        "",
        `Evidence confidence: ${control.confidence}.`,
        ""
      );
    }
  }
  lines.push(
    "## Limitations",
    "",
    ...report.limitations.map((limitation) => `- ${limitation}`),
    ""
  );
  return lines.join("\n");
}

// src/evidence.ts
import { lstat, readFile as readFile2, realpath, stat } from "fs/promises";
import { relative, resolve as resolve2, sep } from "path";
import fg2 from "fast-glob";
var ignored = ["**/.git/**", "**/node_modules/**", "**/dist/**", "**/coverage/**"];
var maxContentFileBytes = 512e3;
var maxContentFiles = 250;
var maxContentTotalBytes = 5e6;
async function matches(repo, patterns) {
  return (await fg2(patterns, {
    cwd: repo,
    dot: true,
    onlyFiles: false,
    unique: true,
    followSymbolicLinks: false,
    ignore: ignored
  })).sort();
}
async function evaluatePathAny(repo, check) {
  const found = await matches(repo, check.patterns);
  return result(
    check.type,
    found.length > 0 ? "met" : "not_met",
    `${found.length} matching path(s)`,
    found
  );
}
async function evaluatePathAll(repo, check) {
  const groups = await Promise.all(check.patterns.map(async (pattern) => matches(repo, [pattern])));
  const missing = check.patterns.filter((_, index) => groups[index]?.length === 0);
  const found = [...new Set(groups.flat())].sort();
  return result(
    check.type,
    missing.length === 0 ? "met" : "not_met",
    missing.length === 0 ? "Every required path pattern matched" : `Missing patterns: ${missing.join(", ")}`,
    found
  );
}
async function readSearchableFiles(repo, patterns) {
  const root = await realpath(repo);
  const paths = (await matches(repo, patterns)).slice(0, maxContentFiles);
  const files = [];
  let totalBytes = 0;
  for (const path of paths) {
    try {
      const requestedPath = resolve2(root, path);
      if ((await lstat(requestedPath)).isSymbolicLink()) continue;
      const canonicalPath = await realpath(requestedPath);
      if (canonicalPath !== root && !canonicalPath.startsWith(`${root}${sep}`)) continue;
      const metadata = await stat(canonicalPath);
      if (!metadata.isFile() || metadata.size > maxContentFileBytes || totalBytes + metadata.size > maxContentTotalBytes) {
        continue;
      }
      totalBytes += metadata.size;
      files.push({ path, text: (await readFile2(canonicalPath, "utf8")).toLowerCase() });
    } catch {
    }
  }
  return files;
}
async function evaluateContent(repo, check) {
  const files = await readSearchableFiles(repo, check.files);
  const matchedNeedles = check.needles.filter(
    (needle) => files.some(({ text }) => text.includes(needle.toLowerCase()))
  );
  const passed = check.type === "content_any" ? matchedNeedles.length > 0 : matchedNeedles.length === check.needles.length;
  return result(
    check.type,
    passed ? "met" : "not_met",
    `Matched ${matchedNeedles.length}/${check.needles.length} required term(s) across ${files.length} file(s)`,
    files.map(({ path }) => path)
  );
}
async function evaluateMaxBytes(repo, check) {
  const paths = await matches(repo, check.patterns);
  const root = await realpath(repo);
  let total = 0;
  let inspected = 0;
  for (const path of paths) {
    const requestedPath = resolve2(root, path);
    if ((await lstat(requestedPath)).isSymbolicLink()) continue;
    const canonicalPath = await realpath(requestedPath);
    if (canonicalPath !== root && !canonicalPath.startsWith(`${root}${sep}`)) continue;
    total += (await stat(canonicalPath)).size;
    inspected += 1;
  }
  const passed = inspected > 0 && total <= check.max_bytes;
  return result(
    check.type,
    passed ? "met" : "not_met",
    `${total} byte(s) across ${inspected} safe matching file(s); maximum ${check.max_bytes}`,
    paths
  );
}
function result(type, status, summary, references) {
  return { type, status, summary, references };
}
async function evaluateCheck(repo, check) {
  switch (check.type) {
    case "path_any":
      return evaluatePathAny(repo, check);
    case "path_all":
      return evaluatePathAll(repo, check);
    case "content_any":
    case "content_all":
      return evaluateContent(repo, check);
    case "max_bytes":
      return evaluateMaxBytes(repo, check);
    case "manual":
      return result("manual", "unknown", check.prompt, []);
  }
}
function activeAttestation(control, attestations, now) {
  const attestation = attestations?.attestations[control.id];
  if (!attestation) return null;
  if (attestation.expires_at && new Date(attestation.expires_at) < now) return null;
  if (attestation.status === "not_applicable" && !control.allow_not_applicable) return null;
  return attestation;
}
async function evaluateControl(repo, control, attestations, now = /* @__PURE__ */ new Date()) {
  const evidence = await Promise.all(
    control.evidence.map(async (check) => evaluateCheck(repo, check))
  );
  const attestation = activeAttestation(control, attestations, now);
  const checksPassed = evidence.every(({ status: status2 }) => status2 === "met");
  const hasManualCheck = control.evidence.some(({ type }) => type === "manual");
  let status = checksPassed ? "met" : "not_met";
  let confidence = checksPassed && !hasManualCheck ? "verified" : "none";
  if (attestation?.status === "not_applicable") {
    status = "not_applicable";
    confidence = "attested";
  } else if (attestation?.status === "met" && control.allow_attestation) {
    status = "met";
    confidence = checksPassed && !hasManualCheck ? "verified" : "attested";
  } else if (attestation?.status === "not_met" || attestation?.status === "unknown") {
    status = attestation.status;
    confidence = "attested";
  } else if (evidence.some(({ status: checkStatus }) => checkStatus === "unknown")) {
    status = "unknown";
  }
  return {
    id: control.id,
    dimension: control.dimension,
    level: control.level,
    title: control.title,
    outcome: control.outcome,
    risk: control.risk,
    status,
    confidence,
    evidence,
    attestation,
    remediation: control.remediation
  };
}

// src/score.ts
function controlPasses(control) {
  return control.status === "met" || control.status === "not_applicable";
}
function dimensionScore(controls, dimension) {
  let score = 0;
  for (const level of [1, 2, 3, 4]) {
    const atLevel = controls.filter(
      (control) => control.dimension === dimension && control.level === level
    );
    if (atLevel.length === 0 || !atLevel.every(controlPasses)) break;
    score = level;
  }
  return score;
}
function assessProfiles(benchmark, dimensions, controls) {
  return benchmark.readiness_profiles.map((profile) => {
    const blockers = benchmark.dimensions.flatMap(({ id }) => {
      const actual = dimensions.find((dimension) => dimension.id === id)?.score ?? 0;
      const required = profile.floors[id];
      if (actual >= required) return [];
      return [
        {
          dimension: id,
          actual,
          required,
          control_ids: controls.filter(
            (control) => control.dimension === id && control.level <= required && !controlPasses(control)
          ).map(({ id: controlId }) => controlId)
        }
      ];
    });
    return { id: profile.id, title: profile.title, passed: blockers.length === 0, blockers };
  });
}
async function assess(repo, benchmark, catalog, profileId, attestations, now = /* @__PURE__ */ new Date()) {
  const profile = benchmark.readiness_profiles.find(({ id }) => id === profileId);
  if (!profile) {
    throw new Error(
      `Unknown profile ${profileId}. Choose: ${benchmark.readiness_profiles.map(({ id }) => id).join(", ")}`
    );
  }
  const controls = await Promise.all(
    catalog.map(async (control) => evaluateControl(repo, control, attestations, now))
  );
  const dimensions = benchmark.dimensions.map(({ id, title }) => {
    const dimensionControls = controls.filter((control) => control.dimension === id);
    return {
      id,
      title,
      score: dimensionScore(controls, id),
      controls_met: dimensionControls.filter(controlPasses).length,
      controls_total: dimensionControls.length
    };
  });
  const profiles = assessProfiles(benchmark, dimensions, controls);
  const total = dimensions.reduce((sum, { score }) => sum + score, 0);
  const highestProfile = [...profiles].reverse().find(({ passed }) => passed)?.id ?? null;
  const targetPassed = profiles.find(({ id }) => id === profileId)?.passed ?? false;
  return {
    schema_version: "0.1.0",
    benchmark: { id: benchmark.id, version: benchmark.version },
    target: { repository: repo, profile: profileId },
    assessed_at: now.toISOString(),
    score: { total, maximum: 40, percentage: Math.round(total / 40 * 100) },
    evidence_summary: {
      verified: controls.filter(
        ({ confidence, status }) => confidence === "verified" && status === "met"
      ).length,
      attested: controls.filter(
        ({ confidence, status }) => confidence === "attested" && status === "met"
      ).length,
      unmet_or_unknown: controls.filter(
        ({ status }) => status === "not_met" || status === "unknown"
      ).length
    },
    dimensions,
    controls,
    profiles,
    readiness: { highest_profile: highestProfile, target_passed: targetPassed },
    limitations: [
      "Repository evidence proves that an artifact exists, not that people consistently follow it.",
      "Self-attestations are reported separately and are not tool-verified evidence.",
      "This assessment does not grant production access, deployment authority, or certification."
    ]
  };
}

// src/cli.ts
var program = new Command();
program.name("agentic-scorecard").description("Evidence-backed readiness assessment for agentic software development harnesses").version("0.1.0");
program.command("validate").description("Validate the bundled benchmark catalog").action(async () => {
  const { benchmark, controls } = await loadBenchmark();
  process.stdout.write(
    `Valid ${benchmark.id} v${benchmark.version}: ${controls.length} controls across ${benchmark.dimensions.length} dimensions.
`
  );
});
program.command("explain").argument("<control-id>", "ADRB control id").description("Explain one control and its evidence rules").action(async (controlId) => {
  const { controls } = await loadBenchmark();
  const control = controls.find(({ id }) => id === controlId.toUpperCase());
  if (!control) throw new Error(`Unknown control: ${controlId}`);
  process.stdout.write(
    `${control.id} \u2014 ${control.title}
Dimension: ${control.dimension}; level: ${control.level}

Outcome: ${control.outcome}
Risk: ${control.risk}
Remediation: ${control.remediation}

Evidence:
${control.evidence.map((check) => `- ${stringify(check).trim().replaceAll("\n", "\n  ")}`).join("\n")}
`
  );
});
program.command("init").argument("[repository]", "repository to initialize", ".").option("--force", "replace an existing attestation file", false).description("Create a manual-attestation template").action(async (repository, options) => {
  const repo = resolve3(repository);
  const path = join2(repo, ".agentic", "attestations.yaml");
  if (!options.force) {
    try {
      await readFile3(path, "utf8");
      throw new Error(`${path} already exists; use --force to replace it`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const { benchmark, controls } = await loadBenchmark();
  const attestations = Object.fromEntries(
    controls.filter((control) => control.evidence.some(({ type }) => type === "manual")).map((control) => {
      const manualCheck = control.evidence.find(
        (check) => check.type === "manual"
      );
      return [
        control.id,
        {
          status: "unknown",
          evidence: `TODO: ${manualCheck?.prompt ?? control.outcome}`,
          owner: "TODO",
          reviewed_at: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
          expires_at: null
        }
      ];
    })
  );
  await mkdir(dirname2(path), { recursive: true });
  await writeFile(
    path,
    `# Claims are visible as attested, never tool-verified. Link durable evidence; do not paste secrets.
${stringify({ benchmark_version: benchmark.version, attestations })}`,
    "utf8"
  );
  process.stdout.write(`Created ${path}
`);
});
program.command("assess").argument("[repository]", "repository to assess", ".").option("--profile <profile>", "target autonomy profile", "pr-creation").option("--format <format>", "json or markdown", "markdown").option("--output <path>", "write the report to a file").option("--attestations <path>", "manual attestation file").option("--enforce", "exit non-zero when the target profile fails", false).option("--github-output", "append summary values to $GITHUB_OUTPUT", false).description("Assess a repository using local, read-only evidence collection").action(
  async (repository, options) => {
    if (!["json", "markdown"].includes(options.format)) {
      throw new Error("--format must be json or markdown");
    }
    const repo = resolve3(repository);
    const { benchmark, controls } = await loadBenchmark();
    const attestationPath = resolve3(
      options.attestations ?? join2(repo, ".agentic", "attestations.yaml")
    );
    const attestations = await loadAttestations(attestationPath, benchmark.version);
    const report = await assess(repo, benchmark, controls, options.profile, attestations);
    const output = options.format === "json" ? `${JSON.stringify(report, null, 2)}
` : toMarkdown(report);
    let reportPath = null;
    if (options.output) {
      reportPath = resolve3(options.output);
      await mkdir(dirname2(reportPath), { recursive: true });
      await writeFile(reportPath, output, "utf8");
      process.stdout.write(`Wrote ${reportPath}
`);
    } else {
      process.stdout.write(output);
    }
    if (options.githubOutput) {
      const githubOutput = process.env.GITHUB_OUTPUT;
      if (!githubOutput) throw new Error("$GITHUB_OUTPUT is unavailable");
      await appendFile(
        githubOutput,
        `score=${report.score.total}
percentage=${report.score.percentage}
highest_profile=${report.readiness.highest_profile ?? "none"}
target_passed=${String(report.readiness.target_passed)}
report_path=${reportPath ?? ""}
`,
        "utf8"
      );
    }
    if (options.enforce && !report.readiness.target_passed) process.exitCode = 2;
  }
);
await program.parseAsync();
