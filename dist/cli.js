#!/usr/bin/env node

// src/cli.ts
import { appendFile, mkdir, readFile as readFile3, writeFile } from "fs/promises";
import { dirname as dirname2, join as join2, resolve as resolve4 } from "path";
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
var EvidenceScopeSchema = z.enum(["repository", "platform", "organization", "outcome"]);
var AssessmentScopeSchema = z.enum(["tracked", "workspace"]);
var PathAnySchema = z.object({
  type: z.literal("path_any"),
  scope: z.literal("repository").default("repository"),
  patterns: z.array(z.string().min(1)).min(1),
  min_bytes: z.number().int().positive().default(1)
});
var PathAllSchema = z.object({
  type: z.literal("path_all"),
  scope: z.literal("repository").default("repository"),
  patterns: z.array(z.string().min(1)).min(1),
  min_bytes: z.number().int().positive().default(1)
});
var ContentAnySchema = z.object({
  type: z.literal("content_any"),
  scope: z.literal("repository").default("repository"),
  files: z.array(z.string().min(1)).min(1),
  needles: z.array(z.string().min(1)).min(1)
});
var ContentAllSchema = z.object({
  type: z.literal("content_all"),
  scope: z.literal("repository").default("repository"),
  files: z.array(z.string().min(1)).min(1),
  needles: z.array(z.string().min(1)).min(1)
});
var ContentTermsSchema = z.object({
  type: z.literal("content_terms"),
  scope: z.literal("repository").default("repository"),
  files: z.array(z.string().min(1)).min(1),
  terms: z.array(z.string().min(1)).min(1),
  min_terms: z.number().int().positive(),
  required_any_terms: z.array(z.string().min(1)).min(1).optional()
});
var MaxBytesSchema = z.object({
  type: z.literal("max_bytes"),
  scope: z.literal("repository").default("repository"),
  patterns: z.array(z.string().min(1)).min(1),
  max_bytes: z.number().int().positive()
});
var ManualSchema = z.object({
  type: z.literal("manual"),
  scope: z.enum(["platform", "organization", "outcome"]).default("organization"),
  prompt: z.string().min(1)
});
var EvidenceCheckSchema = z.discriminatedUnion("type", [
  PathAnySchema,
  PathAllSchema,
  ContentAnySchema,
  ContentAllSchema,
  ContentTermsSchema,
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
  allow_attestation: z.boolean().default(false),
  allow_not_applicable: z.boolean().default(false),
  allow_agent_evidence: z.boolean().default(false)
});
var LegacyRawControlSchema = RawControlSchema.extend({
  allow_attestation: z.boolean().default(true)
});
var ControlFileSchema = z.object({
  dimension: DimensionIdSchema,
  controls: z.array(RawControlSchema).min(1)
});
var LegacyControlFileSchema = z.object({
  dimension: DimensionIdSchema,
  controls: z.array(LegacyRawControlSchema).min(1)
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
  expires_at: z.string().date()
});
var LegacyAttestationSchema = AttestationSchema.extend({
  expires_at: z.string().date().nullable().default(null)
});
var AttestationFileSchema = z.object({
  benchmark_version: z.string().min(1),
  attestations: z.record(z.string(), AttestationSchema).default({})
});
var LegacyAttestationFileSchema = z.object({
  benchmark_version: z.string().min(1),
  attestations: z.record(z.string(), LegacyAttestationSchema).default({})
});
var AgentEvidenceClaimSchema = z.object({
  status: z.enum(["met", "not_met", "unknown"]),
  scope: z.enum(["platform", "organization", "outcome"]),
  summary: z.string().min(1),
  references: z.array(z.string().min(1)).min(1),
  collected_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  error: z.string().min(1).nullable().default(null)
}).strict().superRefine((claim, context) => {
  if (claim.error && claim.status !== "unknown") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A claim with an error must have unknown status",
      path: ["status"]
    });
  }
});
var AgentEvidenceFileSchema = z.object({
  schema_version: z.literal("0.2.0"),
  benchmark_version: z.literal("0.2.0"),
  target: z.object({
    repository: z.string().min(1),
    git_head: z.string().min(1).nullable()
  }).strict(),
  collector: z.object({
    name: z.string().min(1),
    version: z.string().min(1)
  }).strict(),
  claims: z.record(z.string().regex(/^ADRB-[A-Z]{3}-\d{3}$/), AgentEvidenceClaimSchema)
}).strict();

// src/load.ts
var packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
var defaultBenchmarkRoot = join(packageRoot, "benchmark", "v0.2");
async function readYaml(path) {
  return parse(await readFile(path, "utf8"));
}
async function loadBenchmark(root = defaultBenchmarkRoot) {
  const benchmark = BenchmarkSchema.parse(await readYaml(join(root, "benchmark.yaml")));
  const controlPaths = await fg("controls/*.yaml", { cwd: root, absolute: true, onlyFiles: true });
  const controls = [];
  for (const path of controlPaths.sort()) {
    const file = benchmark.version === "0.1.0" ? LegacyControlFileSchema.parse(await readYaml(path)) : ControlFileSchema.parse(await readYaml(path));
    controls.push(...file.controls.map((control) => ({ ...control, dimension: file.dimension })));
  }
  validateCatalog(benchmark, controls);
  return { benchmark, controls };
}
async function loadAttestations(path, benchmarkVersion) {
  try {
    const rawFile = await readYaml(path);
    const file = benchmarkVersion === "0.1.0" ? LegacyAttestationFileSchema.parse(rawFile) : AttestationFileSchema.parse(rawFile);
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
async function loadAgentEvidence(path) {
  try {
    return AgentEvidenceFileSchema.parse(await readYaml(path));
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
    if (benchmark.version === "0.2.0" && control.evidence.some(({ type }) => type === "content_any" || type === "content_all")) {
      throw new Error(`${control.id} uses a legacy broad content collector in benchmark v0.2.0`);
    }
    if (control.allow_agent_evidence && !control.evidence.some(({ type }) => type === "manual")) {
      throw new Error(`${control.id} allows agent evidence without an external evidence check`);
    }
    if (benchmark.version === "0.2.0" && control.allow_attestation && !control.evidence.some(({ type }) => type === "manual")) {
      throw new Error(`${control.id} allows attestation for repository-detected evidence`);
    }
    for (const check of control.evidence) {
      if (check.type === "content_terms" && check.min_terms > check.terms.length) {
        throw new Error(`${control.id} requires more content terms than it defines`);
      }
    }
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
function controlScope(control) {
  return control.evidence.find(({ scope }) => scope !== "repository")?.scope ?? "repository";
}
function safeText(value) {
  return value.replace(/\s+/g, " ").replace(/([\\`*_[\]<>|])/g, "\\$1");
}
function sentence(value) {
  const safe = safeText(value);
  return /[.!?]$/.test(safe) ? safe : `${safe}.`;
}
function references(values) {
  return values.map((value) => `\`${value.replaceAll("`", "'").replace(/\s+/g, " ")}\``).join(", ");
}
function evidenceLines(control) {
  const lines = control.evidence.flatMap((evidence) => {
    const evidenceReferences = evidence.references.length > 0 ? ` References: ${references(evidence.references)}.` : "";
    return `- **${evidence.scope}/${evidence.type}:** ${evidence.status} \u2014 ${sentence(evidence.summary)}${evidenceReferences}`;
  });
  if (control.agent_evidence) {
    lines.push(
      `- **Agent-collected:** ${control.agent_evidence.status} \u2014 ${sentence(control.agent_evidence.summary)} References: ${references(control.agent_evidence.references)}.`
    );
  }
  if (control.attestation) {
    lines.push(
      `- **Human-attested:** ${control.attestation.status} \u2014 ${references([control.attestation.evidence])} (owner: ${safeText(control.attestation.owner)}; reviewed: ${control.attestation.reviewed_at}).`
    );
  }
  if (control.agent_evidence && control.attestation && control.agent_evidence.status !== "unknown" && control.attestation.status !== "unknown" && control.agent_evidence.status !== control.attestation.status) {
    lines.push(
      "- **Conflict:** agent-collected and human-attested statuses disagree; fail closed."
    );
  }
  return lines;
}
function appendControlDetails(lines, heading, controls) {
  lines.push("", `## ${heading}`, "");
  if (controls.length === 0) {
    lines.push("None.");
    return;
  }
  for (const control of controls) {
    lines.push(
      `### ${statusIcon[control.status]} ${control.id} \u2014 ${control.title}`,
      "",
      `**Risk:** ${control.risk}`,
      "",
      `**Improve:** ${control.remediation}`,
      "",
      `Evidence confidence: ${control.confidence}.`,
      "",
      ...evidenceLines(control),
      ""
    );
  }
}
function toMarkdown(report) {
  const target = report.profiles.find(({ id }) => id === report.target.profile);
  const established = report.controls.filter(
    ({ status }) => status === "met" || status === "not_applicable"
  );
  const unresolved = report.controls.filter(
    ({ status }) => status === "not_met" || status === "unknown"
  );
  const repositoryGaps = unresolved.filter((control) => controlScope(control) === "repository");
  const externalControls = unresolved.filter(
    (control) => ["platform", "organization"].includes(controlScope(control))
  );
  const outcomeControls = unresolved.filter((control) => controlScope(control) === "outcome");
  const lines = [
    "# Agentic Development Readiness Assessment",
    "",
    `- Benchmark: ${report.benchmark.id} v${report.benchmark.version}`,
    `- Repository: \`${report.target.repository}\``,
    `- Assessment scope: **${report.target.scope}**`,
    `- Git commit: ${report.target.git_head ? `\`${report.target.git_head}\`` : "unavailable"}`,
    `- Working tree dirty: ${report.target.working_tree_dirty === null ? "unknown" : String(report.target.working_tree_dirty)}`,
    `- Assessed: ${report.assessed_at}`,
    `- Score: **${report.score.total}/${report.score.maximum} (${report.score.percentage}%)**`,
    `- Highest readiness profile: **${report.readiness.highest_profile ?? "none"}**`,
    `- Target \`${report.target.profile}\`: **${report.readiness.target_passed ? "PASS" : "FAIL"}**`,
    `- Evidence: ${report.evidence_summary.repository_detected} repository-detected, ${report.evidence_summary.agent_collected} agent-collected, ${report.evidence_summary.attested} human-attested, ${report.evidence_summary.unmet} unmet, ${report.evidence_summary.unknown} unknown`,
    "",
    "## Dimensions",
    "",
    "| Dimension | Score | Controls met |",
    "| --- | ---: | ---: |",
    ...report.dimensions.map(
      ({ title, score, controls_met: met, controls_total: total }) => `| ${title} | ${score}/4 | ${met}/${total} |`
    ),
    "",
    "> A dimension earns only consecutive levels. Controls met above the first gap remain visible but do not increase its score."
  ];
  if (target && !target.passed) {
    lines.push("", "## Target-profile blockers", "");
    for (const blocker of target.blockers) {
      lines.push(
        `- **${blocker.dimension}:** ${blocker.actual}/4; requires ${blocker.required}/4 (${blocker.control_ids.join(", ") || "lower-level gap"})`
      );
    }
  }
  lines.push("", "## Established controls", "");
  if (established.length === 0) {
    lines.push("None.");
  } else {
    lines.push("| Control | Level | Evidence scope | Confidence |", "| --- | ---: | --- | --- |");
    for (const control of established) {
      lines.push(
        `| ${control.id} \u2014 ${control.title.replaceAll("|", "\\|")} | ${control.level} | ${controlScope(control)} | ${control.confidence} |`
      );
    }
  }
  appendControlDetails(lines, "Repository evidence gaps", repositoryGaps);
  appendControlDetails(lines, "External controls not established", externalControls);
  appendControlDetails(lines, "Outcome evidence not established", outcomeControls);
  lines.push(
    "",
    "## Limitations",
    "",
    ...report.limitations.map((limitation) => `- ${limitation}`),
    ""
  );
  return lines.join("\n");
}

// src/repository.ts
import { execFile } from "child_process";
import { realpath } from "fs/promises";
import { relative, resolve as resolve2, sep } from "path";
import { promisify } from "util";
var execFileAsync = promisify(execFile);
var generatedEvidenceIgnores = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/coverage/**",
  "**/.agentic/reports/**",
  "**/.agentic/report*.json",
  "**/.agentic/agentic-readiness*.json",
  "**/.agentic/agentic-readiness*.md",
  "**/.agentic/attestations.*",
  "**/.agentic/agent-evidence.*",
  "**/.agentic/evidence-request.*"
];
function sanitizeRemote(remote) {
  if (!remote) return null;
  try {
    const url = new URL(remote);
    if (url.protocol === "http:" || url.protocol === "https:") {
      url.username = "";
      url.password = "";
    } else if (url.password) {
      url.password = "";
    }
    return url.toString();
  } catch {
    return remote;
  }
}
async function git(repo, args) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      maxBuffer: 1e7
    });
    return stdout;
  } catch {
    return null;
  }
}
async function createRepositoryContext(repository, scope, excludedPaths = []) {
  const root = await realpath(repository);
  const [headOutput, remoteOutput, statusOutput] = await Promise.all([
    git(root, ["rev-parse", "HEAD"]),
    git(root, ["config", "--get", "remote.origin.url"]),
    git(root, ["status", "--porcelain"])
  ]);
  let includedPaths = null;
  if (scope === "tracked") {
    const tracked = await git(root, ["ls-files", "-z", "--cached"]);
    if (tracked === null) {
      throw new Error(
        "Tracked assessment requires a Git worktree. Use --scope workspace for a provisional filesystem assessment."
      );
    }
    includedPaths = new Set(tracked.split("\0").filter((path) => path.length > 0));
  }
  return {
    metadata: {
      root,
      scope,
      git_head: headOutput?.trim() || null,
      git_remote: sanitizeRemote(remoteOutput?.trim() || null),
      working_tree_dirty: statusOutput === null ? null : statusOutput.length > 0
    },
    includedPaths,
    excludedPaths: new Set(
      excludedPaths.flatMap((path) => {
        const absolute = resolve2(path);
        if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) return [];
        return [relative(root, absolute)];
      })
    )
  };
}
function repositoryEvidenceTarget(metadata) {
  return {
    repository: metadata.git_remote ?? metadata.root,
    git_head: metadata.git_head
  };
}

// src/evidence.ts
import { lstat, readFile as readFile2, realpath as realpath2, stat } from "fs/promises";
import { resolve as resolve3, sep as sep2 } from "path";
import fg2 from "fast-glob";
var maxContentFileBytes = 512e3;
var maxContentFiles = 250;
var maxContentTotalBytes = 5e6;
async function matches(context, patterns) {
  const found = await fg2(patterns, {
    cwd: context.metadata.root,
    dot: true,
    onlyFiles: true,
    unique: true,
    followSymbolicLinks: false,
    ignore: generatedEvidenceIgnores
  });
  return found.filter((path) => context.includedPaths === null || context.includedPaths.has(path)).filter((path) => !context.excludedPaths.has(path)).sort();
}
async function safeFileSize(root, path) {
  try {
    const requestedPath = resolve3(root, path);
    if ((await lstat(requestedPath)).isSymbolicLink()) return null;
    const canonicalPath = await realpath2(requestedPath);
    if (canonicalPath !== root && !canonicalPath.startsWith(`${root}${sep2}`)) return null;
    const metadata = await stat(canonicalPath);
    return metadata.isFile() ? metadata.size : null;
  } catch {
    return null;
  }
}
async function nonEmptyMatches(context, patterns, minBytes) {
  const found = await matches(context, patterns);
  const qualifying = await Promise.all(
    found.map(async (path) => ({ path, size: await safeFileSize(context.metadata.root, path) }))
  );
  return qualifying.filter(({ size }) => size !== null && size >= minBytes).map(({ path }) => path);
}
async function evaluatePathAny(context, check) {
  const found = await nonEmptyMatches(context, check.patterns, check.min_bytes);
  return result(
    check.type,
    check.scope,
    found.length > 0 ? "met" : "not_met",
    `${found.length} safe, non-empty matching file(s)`,
    found
  );
}
async function evaluatePathAll(context, check) {
  const groups = await Promise.all(
    check.patterns.map(async (pattern) => nonEmptyMatches(context, [pattern], check.min_bytes))
  );
  const missing = check.patterns.filter((_, index) => groups[index]?.length === 0);
  const found = [...new Set(groups.flat())].sort();
  return result(
    check.type,
    check.scope,
    missing.length === 0 ? "met" : "not_met",
    missing.length === 0 ? "Every required pattern matched a safe, non-empty file" : `Missing non-empty patterns: ${missing.join(", ")}`,
    found
  );
}
async function readSearchableFiles(context, patterns) {
  const root = context.metadata.root;
  const paths = (await matches(context, patterns)).slice(0, maxContentFiles);
  const files = [];
  let totalBytes = 0;
  for (const path of paths) {
    try {
      const requestedPath = resolve3(root, path);
      if ((await lstat(requestedPath)).isSymbolicLink()) continue;
      const canonicalPath = await realpath2(requestedPath);
      if (canonicalPath !== root && !canonicalPath.startsWith(`${root}${sep2}`)) continue;
      const metadata = await stat(canonicalPath);
      if (!metadata.isFile() || metadata.size === 0 || metadata.size > maxContentFileBytes || totalBytes + metadata.size > maxContentTotalBytes) {
        continue;
      }
      const text = (await readFile2(canonicalPath, "utf8")).toLowerCase();
      if (isGeneratedAssessment(text)) continue;
      totalBytes += metadata.size;
      files.push({ path, text });
    } catch {
    }
  }
  return files;
}
function isGeneratedAssessment(text) {
  const normalized = text.trimStart();
  if (normalized.startsWith("# agentic development readiness assessment")) return true;
  if (!normalized.startsWith("{")) return false;
  try {
    const candidate = JSON.parse(normalized);
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const report = candidate;
    const benchmark = report.benchmark;
    return Boolean(benchmark) && typeof benchmark === "object" && !Array.isArray(benchmark) && benchmark.id === "agentic-development-readiness" && typeof report.assessed_at === "string" && Array.isArray(report.controls);
  } catch {
    return false;
  }
}
async function evaluateLegacyContent(context, check) {
  const files = await readSearchableFiles(context, check.files);
  const matchingFiles = files.filter(
    ({ text }) => check.needles.some((needle) => text.includes(needle.toLowerCase()))
  );
  const matchedNeedles = check.needles.filter(
    (needle) => files.some(({ text }) => text.includes(needle.toLowerCase()))
  );
  const passed = check.type === "content_any" ? matchedNeedles.length > 0 : matchedNeedles.length === check.needles.length;
  return result(
    check.type,
    check.scope,
    passed ? "met" : "not_met",
    `Matched ${matchedNeedles.length}/${check.needles.length} term(s) across ${files.length} candidate file(s)`,
    matchingFiles.map(({ path }) => path)
  );
}
async function evaluateContentTerms(context, check) {
  const files = await readSearchableFiles(context, check.files);
  const matchesByFile = files.map(({ path, text }) => ({
    path,
    matched: check.terms.filter((term) => containsTerm(text, term)).length,
    requiredMatched: check.required_any_terms?.filter((term) => containsTerm(text, term)).length ?? 0
  }));
  const qualifying = matchesByFile.filter(
    ({ matched, requiredMatched }) => matched >= check.min_terms && (check.required_any_terms === void 0 || requiredMatched > 0)
  );
  const strongest = matchesByFile.reduce((maximum, file) => Math.max(maximum, file.matched), 0);
  const strongestRequired = matchesByFile.reduce(
    (maximum, file) => Math.max(maximum, file.requiredMatched),
    0
  );
  const requiredSummary = check.required_any_terms ? `; strongest required match ${strongestRequired}/${check.required_any_terms.length}` : "";
  return result(
    check.type,
    check.scope,
    qualifying.length > 0 ? "met" : "not_met",
    `${qualifying.length} qualifying file(s); strongest co-located match ${strongest}/${check.terms.length} term(s)${requiredSummary} across ${files.length} candidate file(s); threshold ${check.min_terms}`,
    qualifying.map(({ path }) => path)
  );
}
function containsTerm(text, term) {
  const pattern = term.trim().split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s_-]+");
  return new RegExp(`(^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, "i").test(text);
}
async function evaluateMaxBytes(context, check) {
  const paths = await matches(context, check.patterns);
  let total = 0;
  const inspected = [];
  for (const path of paths) {
    const size = await safeFileSize(context.metadata.root, path);
    if (size === null) continue;
    total += size;
    inspected.push(path);
  }
  const passed = inspected.length > 0 && total <= check.max_bytes;
  return result(
    check.type,
    check.scope,
    passed ? "met" : "not_met",
    `${total} byte(s) across ${inspected.length} safe matching file(s); maximum ${check.max_bytes}`,
    inspected
  );
}
function result(type, scope, status, summary, references2) {
  return { type, scope, status, summary, references: references2 };
}
async function evaluateCheck(context, check) {
  switch (check.type) {
    case "path_any":
      return evaluatePathAny(context, check);
    case "path_all":
      return evaluatePathAll(context, check);
    case "content_any":
    case "content_all":
      return evaluateLegacyContent(context, check);
    case "content_terms":
      return evaluateContentTerms(context, check);
    case "max_bytes":
      return evaluateMaxBytes(context, check);
    case "manual":
      return result("manual", check.scope, "unknown", check.prompt, []);
  }
}
function activeAttestation(control, attestations, now) {
  if (!control.allow_attestation) return null;
  const attestation = attestations?.attestations[control.id];
  if (!attestation) return null;
  if (attestation.expires_at && new Date(attestation.expires_at) < now) return null;
  if (attestation.status === "not_applicable" && !control.allow_not_applicable) return null;
  return attestation;
}
function activeAgentEvidence(control, claim, now) {
  if (!claim || !control.allow_agent_evidence) return null;
  if (new Date(claim.expires_at) < now) return null;
  return claim;
}
async function evaluateControl(context, control, attestations, agentClaim, now = /* @__PURE__ */ new Date()) {
  const evidence = await Promise.all(
    control.evidence.map(async (check) => evaluateCheck(context, check))
  );
  const attestation = activeAttestation(control, attestations, now);
  const agentEvidence = activeAgentEvidence(control, agentClaim, now);
  const checksPassed = evidence.every(({ status: status2 }) => status2 === "met");
  const hasManualCheck = control.evidence.some(({ type }) => type === "manual");
  let status = checksPassed ? "met" : "not_met";
  let confidence = checksPassed && !hasManualCheck ? "repository-detected" : "none";
  const attestationStatus = attestation?.status === "unknown" ? null : attestation?.status ?? null;
  const hasExternalConflict = agentEvidence !== null && agentEvidence.status !== "unknown" && attestationStatus !== null && agentEvidence.status !== attestationStatus;
  if (checksPassed && !hasManualCheck) {
  } else if (hasExternalConflict) {
    status = "unknown";
    confidence = "none";
  } else if (agentEvidence && agentEvidence.status !== "unknown") {
    status = agentEvidence.status;
    confidence = "agent-collected";
  } else if (attestation?.status === "not_applicable") {
    status = "not_applicable";
    confidence = "attested";
  } else if (attestation?.status === "met") {
    status = "met";
    confidence = "attested";
  } else if (attestation?.status === "not_met" || attestation?.status === "unknown") {
    status = attestation.status;
    confidence = "attested";
  } else if (agentEvidence?.status === "unknown") {
    status = "unknown";
    confidence = "agent-collected";
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
    agent_evidence: agentEvidence,
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
async function assess(repo, benchmark, catalog, profileId, options = {}) {
  const profile = benchmark.readiness_profiles.find(({ id }) => id === profileId);
  if (!profile) {
    throw new Error(
      `Unknown profile ${profileId}. Choose: ${benchmark.readiness_profiles.map(({ id }) => id).join(", ")}`
    );
  }
  const scope = options.scope ?? "tracked";
  const now = options.now ?? /* @__PURE__ */ new Date();
  const context = await createRepositoryContext(repo, scope, options.excludedPaths);
  validateAgentEvidence(benchmark, catalog, context, options.agentEvidence ?? null, now);
  const controls = await Promise.all(
    catalog.map(
      async (control) => evaluateControl(
        context,
        control,
        options.attestations ?? null,
        options.agentEvidence?.claims[control.id] ?? null,
        now
      )
    )
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
    schema_version: "0.2.0",
    benchmark: { id: benchmark.id, version: benchmark.version },
    target: {
      repository: repo,
      profile: profileId,
      scope,
      git_head: context.metadata.git_head,
      git_remote: context.metadata.git_remote,
      working_tree_dirty: context.metadata.working_tree_dirty
    },
    assessed_at: now.toISOString(),
    score: { total, maximum: 40, percentage: Math.round(total / 40 * 100) },
    evidence_summary: {
      repository_detected: controls.filter(
        ({ confidence, status }) => confidence === "repository-detected" && status === "met"
      ).length,
      agent_collected: controls.filter(
        ({ confidence, status }) => confidence === "agent-collected" && status === "met"
      ).length,
      attested: controls.filter(
        ({ confidence, status }) => confidence === "attested" && status === "met"
      ).length,
      unmet: controls.filter(({ status }) => status === "not_met").length,
      unknown: controls.filter(({ status }) => status === "unknown").length
    },
    dimensions,
    controls,
    profiles,
    readiness: { highest_profile: highestProfile, target_passed: targetPassed },
    limitations: [
      scope === "tracked" ? "Tracked mode considers only Git-tracked paths, using current working-tree contents; uncommitted edits to tracked files can affect the result." : "Workspace mode includes untracked local files and is provisional; do not compare it directly with tracked-mode reports.",
      "Repository-detected evidence proves a qualifying artifact match, not consistent practice or external enforcement.",
      "Agent-collected evidence and human attestations are reported separately and are not independently verified.",
      "This assessment does not grant production access, deployment authority, or certification."
    ]
  };
}
function validateAgentEvidence(benchmark, catalog, context, evidence, now) {
  if (!evidence) return;
  if (evidence.benchmark_version !== benchmark.version) {
    throw new Error(
      `Agent evidence benchmark ${evidence.benchmark_version} does not match ${benchmark.version}`
    );
  }
  const expectedTarget = repositoryEvidenceTarget(context.metadata);
  if (evidence.target.repository !== expectedTarget.repository) {
    throw new Error(
      `Agent evidence target ${evidence.target.repository} does not match ${expectedTarget.repository}`
    );
  }
  if (evidence.target.git_head !== expectedTarget.git_head) {
    throw new Error(
      `Agent evidence commit ${evidence.target.git_head ?? "unavailable"} does not match ${expectedTarget.git_head ?? "an unavailable Git commit"}`
    );
  }
  const controls = new Map(catalog.map((control) => [control.id, control]));
  if (Object.keys(evidence.claims).length > 0 && (evidence.collector.name.startsWith("TODO") || evidence.collector.version.startsWith("TODO"))) {
    throw new Error("Agent evidence with claims must identify the collector name and version");
  }
  for (const [controlId, claim] of Object.entries(evidence.claims)) {
    const control = controls.get(controlId);
    if (!control) throw new Error(`Agent evidence references unknown control ${controlId}`);
    if (!control.allow_agent_evidence) {
      throw new Error(`${controlId} does not permit agent-collected evidence`);
    }
    const allowedScopes = control.evidence.filter(({ type }) => type === "manual").map(({ scope: evidenceScope }) => evidenceScope);
    if (!allowedScopes.includes(claim.scope)) {
      throw new Error(`${controlId} does not accept ${claim.scope} evidence`);
    }
    if (new Date(claim.collected_at) > new Date(claim.expires_at)) {
      throw new Error(`${controlId} expires before it was collected`);
    }
    if (new Date(claim.collected_at) > now) {
      throw new Error(`${controlId} has a future collection timestamp`);
    }
    if (claim.summary.startsWith("TODO") || claim.references.some((reference) => reference.startsWith("TODO"))) {
      throw new Error(`${controlId} contains unresolved TODO evidence`);
    }
  }
}

// src/cli.ts
var program = new Command();
program.name("agentic-scorecard").description("Evidence-backed readiness assessment for agentic software development harnesses").version("0.2.0");
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
  const repo = resolve4(repository);
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
  const reviewedAt = /* @__PURE__ */ new Date();
  const expiresAt = new Date(reviewedAt);
  expiresAt.setDate(expiresAt.getDate() + 90);
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
          reviewed_at: reviewedAt.toISOString().slice(0, 10),
          expires_at: expiresAt.toISOString().slice(0, 10)
        }
      ];
    })
  );
  await mkdir(dirname2(path), { recursive: true });
  await writeFile(
    path,
    `# Claims are visibly human-attested. Link durable evidence; do not paste secrets.
${stringify({ benchmark_version: benchmark.version, attestations })}`,
    "utf8"
  );
  process.stdout.write(`Created ${path}
`);
});
program.command("init-evidence").argument("[repository]", "repository to prepare external evidence for", ".").option("--output <path>", "agent evidence bundle path").option("--request-output <path>", "human-readable evidence request path").option("--force", "replace an existing agent evidence bundle", false).description("Create a target-bound template for agent-collected external evidence").action(
  async (repository, options) => {
    const repo = resolve4(repository);
    const path = resolve4(options.output ?? join2(repo, ".agentic", "agent-evidence.yaml"));
    const requestPath = resolve4(
      options.requestOutput ?? join2(repo, ".agentic", "evidence-request.md")
    );
    if (path === requestPath) {
      throw new Error("Agent evidence bundle and request paths must be different");
    }
    if (!options.force) {
      for (const candidate of [path, requestPath]) {
        try {
          await readFile3(candidate, "utf8");
          throw new Error(`${candidate} already exists; use --force to replace it`);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
    }
    const { benchmark, controls } = await loadBenchmark();
    const context = await createRepositoryContext(repo, "tracked").catch((error) => {
      if (error instanceof Error && error.message.startsWith("Tracked assessment requires a Git worktree")) {
        throw new Error(
          "init-evidence requires a Git worktree with a commit so the bundle can be target-bound."
        );
      }
      throw error;
    });
    if (!context.metadata.git_head) {
      throw new Error(
        "init-evidence requires a Git commit so the bundle can be target-bound. Commit the assessed state and try again."
      );
    }
    const eligibleControls = controls.filter(({ allow_agent_evidence: allowed }) => allowed);
    const bundle = {
      schema_version: "0.2.0",
      benchmark_version: benchmark.version,
      target: repositoryEvidenceTarget(context.metadata),
      collector: { name: "TODO: agent or adapter name", version: "TODO" },
      claims: {}
    };
    await mkdir(dirname2(path), { recursive: true });
    await writeFile(
      path,
      `# Use authorized read-only tools. Do not paste secrets or raw sensitive content.
${stringify(bundle)}`,
      "utf8"
    );
    await mkdir(dirname2(requestPath), { recursive: true });
    await writeFile(
      requestPath,
      [
        "# ADRB v0.2 external evidence request",
        "",
        `- Repository: ${bundle.target.repository}`,
        `- Git commit: ${bundle.target.git_head ?? "unavailable"}`,
        `- Benchmark: ${benchmark.version}`,
        "",
        "Obtain authorization before accessing connected systems. Use read-only, least-privileged tools. Add only attempted claims to the bundle; errors remain `unknown`. Never paste secrets or raw sensitive content.",
        "",
        ...eligibleControls.flatMap((control) => {
          const manualCheck = control.evidence.find(
            (check) => check.type === "manual"
          );
          return [
            `## ${control.id} \u2014 ${control.title}`,
            "",
            `- Scope: ${manualCheck?.scope ?? "organization"}`,
            `- Request: ${manualCheck?.prompt ?? control.outcome}`,
            `- Risk: ${control.risk}`,
            ""
          ];
        })
      ].join("\n"),
      "utf8"
    );
    process.stdout.write(`Created ${path}
Created ${requestPath}
`);
  }
);
program.command("assess").argument("[repository]", "repository to assess", ".").option("--profile <profile>", "target autonomy profile", "pr-creation").option("--format <format>", "json or markdown", "markdown").option("--output <path>", "write the report to a file").option("--attestations <path>", "manual attestation file").option("--agent-evidence <path>", "agent-collected external evidence bundle").option("--scope <scope>", "tracked or workspace", "tracked").option("--enforce", "exit non-zero when the target profile fails", false).option("--github-output", "append summary values to $GITHUB_OUTPUT", false).description("Assess a repository using local, read-only evidence collection").action(
  async (repository, options) => {
    if (!["json", "markdown"].includes(options.format)) {
      throw new Error("--format must be json or markdown");
    }
    if (!["tracked", "workspace"].includes(options.scope)) {
      throw new Error("--scope must be tracked or workspace");
    }
    const repo = resolve4(repository);
    const { benchmark, controls } = await loadBenchmark();
    const attestationPath = resolve4(
      options.attestations ?? join2(repo, ".agentic", "attestations.yaml")
    );
    const attestations = await loadAttestations(attestationPath, benchmark.version);
    const agentEvidencePath = resolve4(
      options.agentEvidence ?? join2(repo, ".agentic", "agent-evidence.yaml")
    );
    const agentEvidence = await loadAgentEvidence(agentEvidencePath);
    const reportPath = options.output ? resolve4(options.output) : null;
    const report = await assess(repo, benchmark, controls, options.profile, {
      scope: options.scope,
      attestations,
      agentEvidence,
      excludedPaths: [attestationPath, agentEvidencePath, ...reportPath ? [reportPath] : []]
    });
    const output = options.format === "json" ? `${JSON.stringify(report, null, 2)}
` : toMarkdown(report);
    if (reportPath) {
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
