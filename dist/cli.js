#!/usr/bin/env node

// src/cli.ts
import { appendFile, mkdir, readFile as readFile4, writeFile } from "fs/promises";
import { dirname as dirname2, join as join3, resolve as resolve4 } from "path";
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
var ManualEvidenceScopeSchema = z.enum(["platform", "organization", "outcome"]);
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
var OwnershipMapSchema = z.object({
  type: z.literal("ownership_map"),
  scope: z.literal("repository").default("repository"),
  patterns: z.array(z.string().min(1)).min(1)
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
  required_any_terms: z.array(z.string().min(1)).min(1).optional(),
  max_span_lines: z.number().int().positive().max(200).optional(),
  max_files_per_pattern: z.number().int().positive().max(250).optional()
});
var ContentGroupsSchema = z.object({
  type: z.literal("content_groups"),
  scope: z.literal("repository").default("repository"),
  files: z.array(z.string().min(1)).min(1),
  groups: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      terms: z.array(z.string().min(1)).min(1)
    })
  ).min(1),
  min_groups: z.number().int().positive(),
  max_span_lines: z.number().int().positive().max(200).optional(),
  max_files_per_pattern: z.number().int().positive().max(250).optional()
});
var CiProviderSchema = z.object({
  id: z.enum(["github-actions", "gitlab-ci", "azure-pipelines"]),
  files: z.array(z.string().min(1)).min(1)
});
var CiCommandSchema = z.object({
  type: z.literal("ci_command"),
  scope: z.literal("repository").default("repository"),
  providers: z.array(CiProviderSchema).default([]),
  terms: z.array(z.string().min(1)).min(1),
  min_terms: z.number().int().positive().default(1),
  max_files_per_pattern: z.number().int().positive().max(250).optional()
});
var MaxBytesSchema = z.object({
  type: z.literal("max_bytes"),
  scope: z.literal("repository").default("repository"),
  patterns: z.array(z.string().min(1)).min(1),
  max_bytes: z.number().int().positive()
});
var ManualSchema = z.object({
  type: z.literal("manual"),
  scope: ManualEvidenceScopeSchema.default("organization"),
  prompt: z.string().min(1)
});
var EvidenceCheckSchema = z.discriminatedUnion("type", [
  PathAnySchema,
  PathAllSchema,
  OwnershipMapSchema,
  ContentAnySchema,
  ContentAllSchema,
  ContentTermsSchema,
  ContentGroupsSchema,
  CiCommandSchema,
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
  evidence_mode: z.enum(["all", "any"]).default("all"),
  remediation: z.string().min(1),
  references: z.array(z.string().min(1)).default([]),
  allow_attestation: z.boolean().default(false),
  allow_not_applicable: z.boolean().default(false),
  allow_agent_evidence: z.boolean().default(false),
  agent_evidence_scopes: z.array(EvidenceScopeSchema).default([])
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
var DetectorAdapterExtensionSchema = z.object({
  control_id: z.string().regex(/^ADRB-[A-Z]{3}-\d{3}$/),
  evidence_index: z.number().int().nonnegative(),
  patterns: z.array(z.string().min(1)).min(1).optional(),
  files: z.array(z.string().min(1)).min(1).optional(),
  terms: z.array(z.string().min(1)).min(1).optional(),
  required_any_terms: z.array(z.string().min(1)).min(1).optional(),
  ci_providers: z.array(CiProviderSchema).min(1).optional()
}).strict().superRefine((extension, context) => {
  const extensionKinds = [
    extension.patterns,
    extension.files,
    extension.terms,
    extension.required_any_terms,
    extension.ci_providers
  ].filter(Boolean).length;
  if (extensionKinds !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A detector extension must declare exactly one of patterns, files, terms, required_any_terms, or ci_providers"
    });
  }
});
var DetectorAdapterSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  benchmark_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  extensions: z.array(DetectorAdapterExtensionSchema).min(1)
}).strict();
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
var AgentEvidenceClaimV03Schema = z.object({
  status: z.enum(["met", "not_met", "unknown"]),
  scope: EvidenceScopeSchema,
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
  if (claim.scope === "repository" && claim.references.some((reference) => !reference.startsWith("repo:"))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Repository claims must use repo:<tracked-path>[#Lx-Ly] references",
      path: ["references"]
    });
  }
});
function modernAgentEvidenceFileSchema(version) {
  return z.object({
    schema_version: z.literal(version),
    benchmark_version: z.literal(version),
    target: z.object({
      repository: z.string().min(1),
      git_head: z.string().min(1)
    }).strict(),
    collector: z.object({
      name: z.string().min(1),
      version: z.string().min(1)
    }).strict(),
    claims: z.record(z.string().regex(/^ADRB-[A-Z]{3}-\d{3}$/), AgentEvidenceClaimV03Schema)
  }).strict();
}
var AgentEvidenceFileV03Schema = modernAgentEvidenceFileSchema("0.3.0");
var AgentEvidenceFileV04Schema = modernAgentEvidenceFileSchema("0.4.0");

// src/load.ts
var packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
var defaultBenchmarkRoot = join(packageRoot, "benchmark", "v0.4");
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
  const adapterPaths = await fg("adapters/*.yaml", {
    cwd: root,
    absolute: true,
    onlyFiles: true
  });
  for (const path of adapterPaths.sort()) {
    const adapter = DetectorAdapterSchema.parse(await readYaml(path));
    applyDetectorAdapter(benchmark, controls, adapter);
  }
  validateCatalog(benchmark, controls);
  return { benchmark, controls };
}
function applyDetectorAdapter(benchmark, controls, adapter) {
  if (adapter.benchmark_version !== benchmark.version) {
    throw new Error(
      `Detector adapter ${adapter.id} targets ${adapter.benchmark_version}, not ${benchmark.version}`
    );
  }
  for (const extension of adapter.extensions) {
    const control = controls.find(({ id }) => id === extension.control_id);
    if (!control) {
      throw new Error(`Detector adapter ${adapter.id} references unknown ${extension.control_id}`);
    }
    const check = control.evidence[extension.evidence_index];
    if (!check) {
      throw new Error(
        `Detector adapter ${adapter.id} references missing evidence index ${extension.evidence_index} on ${control.id}`
      );
    }
    if (extension.patterns) {
      if (!("patterns" in check)) {
        throw new Error(
          `Detector adapter ${adapter.id} cannot add patterns to ${control.id} evidence ${extension.evidence_index}`
        );
      }
      check.patterns = [.../* @__PURE__ */ new Set([...check.patterns, ...extension.patterns])];
    }
    if (extension.files) {
      if (!("files" in check)) {
        throw new Error(
          `Detector adapter ${adapter.id} cannot add files to ${control.id} evidence ${extension.evidence_index}`
        );
      }
      check.files = [.../* @__PURE__ */ new Set([...check.files, ...extension.files])];
    }
    if (extension.terms) {
      if (check.type !== "content_terms" && check.type !== "ci_command") {
        throw new Error(
          `Detector adapter ${adapter.id} cannot add terms to ${control.id} evidence ${extension.evidence_index}`
        );
      }
      check.terms = [.../* @__PURE__ */ new Set([...check.terms, ...extension.terms])];
    }
    if (extension.required_any_terms) {
      if (check.type !== "content_terms") {
        throw new Error(
          `Detector adapter ${adapter.id} cannot add required terms to ${control.id} evidence ${extension.evidence_index}`
        );
      }
      check.required_any_terms = [
        .../* @__PURE__ */ new Set([...check.required_any_terms ?? [], ...extension.required_any_terms])
      ];
    }
    if (extension.ci_providers) {
      if (check.type !== "ci_command") {
        throw new Error(
          `Detector adapter ${adapter.id} cannot add CI providers to ${control.id} evidence ${extension.evidence_index}`
        );
      }
      const providers = new Map(check.providers.map((provider) => [provider.id, provider]));
      for (const extensionProvider of extension.ci_providers) {
        const provider = providers.get(extensionProvider.id);
        providers.set(extensionProvider.id, {
          id: extensionProvider.id,
          files: [.../* @__PURE__ */ new Set([...provider?.files ?? [], ...extensionProvider.files])]
        });
      }
      check.providers = [...providers.values()];
    }
  }
}
async function loadAttestations(path, benchmarkVersion, options = {}) {
  try {
    const rawFile = await readYaml(path);
    const artifactVersion = versionField(rawFile, "benchmark_version");
    if (artifactVersion && handleVersionMismatch(
      "Attestation",
      path,
      artifactVersion,
      benchmarkVersion,
      "init --force",
      options
    )) {
      return null;
    }
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
async function loadAgentEvidence(path, benchmarkVersion, options = {}) {
  try {
    const rawFile = await readYaml(path);
    const artifactVersion = versionField(rawFile, "benchmark_version");
    const schemaVersion = versionField(rawFile, "schema_version");
    const mismatchedVersion = [artifactVersion, schemaVersion].find(
      (version) => version && version !== benchmarkVersion
    );
    if (mismatchedVersion && handleVersionMismatch(
      "Agent evidence",
      path,
      mismatchedVersion,
      benchmarkVersion,
      "init-evidence --force",
      options
    )) {
      return null;
    }
    const file = (() => {
      if (benchmarkVersion === "0.2.0") return AgentEvidenceFileSchema.parse(rawFile);
      if (benchmarkVersion === "0.3.0") return AgentEvidenceFileV03Schema.parse(rawFile);
      if (benchmarkVersion === "0.4.0") return AgentEvidenceFileV04Schema.parse(rawFile);
      throw new Error(`Agent evidence bundles are unsupported for benchmark ${benchmarkVersion}`);
    })();
    if (file.benchmark_version !== benchmarkVersion) {
      throw new Error(
        `Agent evidence benchmark version ${file.benchmark_version} does not match ${benchmarkVersion}`
      );
    }
    return file;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function versionField(value, field) {
  if (!value || typeof value !== "object" || !(field in value)) return null;
  const version = value[field];
  return typeof version === "string" ? version : null;
}
function handleVersionMismatch(label, path, artifactVersion, benchmarkVersion, regenerateCommand, options) {
  if (artifactVersion === benchmarkVersion) return false;
  const mismatch = `${label} file ${path} targets ADRB v${artifactVersion}, not v${benchmarkVersion}`;
  if (!options.ignoreVersionMismatch) {
    throw new Error(
      `${mismatch}. Regenerate it with \`agentic-scorecard ${regenerateCommand}\` or pass a v${benchmarkVersion} file.`
    );
  }
  options.onWarning?.(
    `Ignored auto-loaded ${label.toLowerCase()} file ${path} because it targets ADRB v${artifactVersion}, not v${benchmarkVersion}. Regenerate it with \`agentic-scorecard ${regenerateCommand}\` before relying on its claims.`
  );
  return true;
}
function validateCatalog(benchmark, controls) {
  const ids = /* @__PURE__ */ new Set();
  for (const control of controls) {
    if (ids.has(control.id)) throw new Error(`Duplicate control id: ${control.id}`);
    ids.add(control.id);
    if (["0.2.0", "0.3.0", "0.4.0"].includes(benchmark.version) && control.evidence.some(({ type }) => type === "content_any" || type === "content_all")) {
      throw new Error(
        `${control.id} uses a legacy broad content collector in benchmark ${benchmark.version}`
      );
    }
    const manualScopes = control.evidence.filter(({ type }) => type === "manual").map(({ scope }) => scope);
    const allowedAgentScopes = control.agent_evidence_scopes.length > 0 ? control.agent_evidence_scopes : manualScopes;
    if (control.allow_agent_evidence && allowedAgentScopes.length === 0) {
      throw new Error(`${control.id} allows agent evidence without an eligible evidence scope`);
    }
    if (!control.allow_agent_evidence && control.agent_evidence_scopes.length > 0) {
      throw new Error(`${control.id} declares agent evidence scopes but does not allow it`);
    }
    if (benchmark.version === "0.2.0" && control.agent_evidence_scopes.some((scope) => scope === "repository")) {
      throw new Error(`${control.id} changes immutable v0.2 repository evidence semantics`);
    }
    if (["0.2.0", "0.3.0", "0.4.0"].includes(benchmark.version) && control.allow_attestation && !control.evidence.some(({ type }) => type === "manual")) {
      throw new Error(`${control.id} allows attestation for repository-detected evidence`);
    }
    if (control.evidence_mode === "any" && control.evidence.length < 2) {
      throw new Error(`${control.id} uses alternative evidence without multiple evidence checks`);
    }
    for (const check of control.evidence) {
      if (check.type === "content_terms" && check.min_terms > check.terms.length) {
        throw new Error(`${control.id} requires more content terms than it defines`);
      }
      if (check.type === "ci_command" && check.min_terms > check.terms.length) {
        throw new Error(`${control.id} requires more CI command terms than it defines`);
      }
      if (check.type === "ci_command" && check.providers.length === 0) {
        throw new Error(`${control.id} defines a CI command collector without a provider adapter`);
      }
      if (check.type === "content_groups") {
        const groupIds = check.groups.map(({ id }) => id);
        if (new Set(groupIds).size !== groupIds.length) {
          throw new Error(`${control.id} defines duplicate semantic evidence groups`);
        }
        if (check.min_groups > check.groups.length) {
          throw new Error(`${control.id} requires more semantic groups than it defines`);
        }
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
function confidenceRule(control) {
  if (control.confidence !== "none") return "";
  return control.evidence_mode === "any" ? " \u2014 one evidence alternative must pass" : " \u2014 all required evidence checks must pass";
}
function appendControlDetails(lines, heading, controls, showCheckSummary) {
  lines.push("", `## ${heading}`, "");
  if (controls.length === 0) {
    lines.push("None.");
    return;
  }
  for (const control of controls) {
    const establishedChecks = control.evidence.filter(({ status }) => status === "met").length;
    const blockingChecks = control.evidence.flatMap(
      ({ scope, status, type }, index) => status === "met" ? [] : [`#${index + 1} ${scope}/${type}`]
    );
    const blockingSummary = blockingChecks.map((check) => `\`${check}\``).join(", ");
    const checkSummary = control.evidence_mode === "any" ? `Alternative evidence checks established: ${establishedChecks}/${control.evidence.length}; one required.` : `Required evidence checks established: ${establishedChecks}/${control.evidence.length}.`;
    const blockingLabel = control.evidence_mode === "any" ? "Unresolved alternatives" : "Blocking checks";
    const confidenceExplanation = confidenceRule(control);
    lines.push(
      `### ${statusIcon[control.status]} ${control.id} \u2014 ${control.title}`,
      "",
      `**Risk:** ${control.risk}`,
      "",
      `**Improve:** ${control.remediation}`,
      "",
      ...showCheckSummary ? [
        checkSummary,
        ...blockingChecks.length > 0 ? [`${blockingLabel}: ${blockingSummary}.`] : [],
        `Control confidence: ${control.confidence}${confidenceExplanation}.`
      ] : [`Evidence confidence: ${control.confidence}.`],
      "",
      ...evidenceLines(control),
      ""
    );
  }
}
function toMarkdown(report) {
  const showCheckSummary = report.benchmark.version === "0.4.0";
  const target = report.profiles.find(({ id }) => id === report.target.profile);
  const targetDependencies = target?.evidence_dependencies;
  const dependencyCount = (targetDependencies?.agent_collected ?? 0) + (targetDependencies?.attested ?? 0);
  const targetProvenance = target?.passed && dependencyCount > 0 ? ` (depends on ${[
    targetDependencies?.agent_collected ? `${targetDependencies.agent_collected} agent-collected` : null,
    targetDependencies?.attested ? `${targetDependencies.attested} human-attested` : null
  ].filter(Boolean).join(" and ")} required ${dependencyCount === 1 ? "control" : "controls"})` : "";
  const established = report.controls.filter(
    ({ status }) => status === "met" || status === "not_applicable"
  );
  const unresolved = report.controls.filter(
    ({ status }) => status === "not_met" || status === "unknown"
  );
  const alternativeControls = unresolved.filter(({ evidence_mode: mode }) => mode === "any");
  const requiredControls = unresolved.filter(({ evidence_mode: mode }) => mode !== "any");
  const repositoryGaps = requiredControls.filter(
    (control) => controlScope(control) === "repository"
  );
  const externalControls = requiredControls.filter(
    (control) => ["platform", "organization"].includes(controlScope(control))
  );
  const outcomeControls = requiredControls.filter((control) => controlScope(control) === "outcome");
  const repositoryOnlyBaseline = !report.controls.some(
    ({ agent_evidence: agentEvidence, attestation }) => agentEvidence !== null || attestation !== null
  );
  const resolvedEvidence = report.evidence_summary.resolved !== void 0 && report.evidence_summary.total !== void 0 ? `; ${report.evidence_summary.resolved}/${report.evidence_summary.total} controls resolved` : "";
  const lines = [
    "# Agentic Development Readiness Assessment",
    "",
    `- Benchmark: ${report.benchmark.id} v${report.benchmark.version}`,
    `- Repository: \`${report.target.repository}\``,
    `- Assessment scope: **${report.target.scope}**`,
    `- Git commit: ${report.target.git_head ? `\`${report.target.git_head}\`` : "unavailable"}`,
    `- Working tree dirty: ${report.target.working_tree_dirty === null ? "unknown" : String(report.target.working_tree_dirty)}`,
    `- Assessed: ${report.assessed_at}`,
    ...repositoryOnlyBaseline ? [
      "- Assessment mode: **repository-only baseline** \u2014 platform, organization, and outcome evidence has not been established"
    ] : ["- Assessment mode: **evidence-assisted assessment**"],
    ...report.score.repository ? [
      `- Repository-detected progress: **${report.score.repository.achieved}/${report.score.repository.ceiling} (${report.score.repository.percentage}%)** of the maturity levels the offline repository collector can establish`
    ] : [],
    `- Normative readiness score: **${report.score.total}/${report.score.maximum} (${report.score.percentage}%)**`,
    `- Highest readiness profile: **${report.readiness.highest_profile ?? "none"}**`,
    `- Target \`${report.target.profile}\`: **${report.readiness.target_passed ? `PASS${targetProvenance}` : "FAIL"}**`,
    `- Established evidence: ${report.evidence_summary.repository_detected} repository-detected, ${report.evidence_summary.agent_collected} agent-collected, ${report.evidence_summary.attested} human-attested; ${report.evidence_summary.unmet} unmet, ${report.evidence_summary.unknown} unknown${resolvedEvidence}`,
    ...report.warnings && report.warnings.length > 0 ? [`- Warnings: **${report.warnings.length} \u2014 review before using this assessment**`] : [],
    "",
    ...report.warnings && report.warnings.length > 0 ? [
      "## Warnings",
      "",
      ...report.warnings.map((warning) => `- WARNING: ${safeText(warning)}`),
      ""
    ] : [],
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
  appendControlDetails(lines, "Repository evidence gaps", repositoryGaps, showCheckSummary);
  if (showCheckSummary) {
    appendControlDetails(
      lines,
      "Alternative evidence paths not established",
      alternativeControls,
      showCheckSummary
    );
  }
  appendControlDetails(
    lines,
    "External controls not established",
    externalControls,
    showCheckSummary
  );
  appendControlDetails(
    lines,
    "Outcome evidence not established",
    outcomeControls,
    showCheckSummary
  );
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
import { isAbsolute, relative, resolve as resolve2, sep } from "path";
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
function relativePathWithin(root, path) {
  const candidate = relative(root, path);
  if (candidate === "") return candidate;
  if (candidate === ".." || candidate.startsWith(`..${sep}`) || isAbsolute(candidate)) {
    return null;
  }
  return candidate;
}
function normalizeExcludedPath(path, requestedRoot, canonicalRoot) {
  const absolute = isAbsolute(path) ? resolve2(path) : resolve2(requestedRoot, path);
  return relativePathWithin(requestedRoot, absolute) ?? relativePathWithin(canonicalRoot, absolute);
}
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
  const requestedRoot = resolve2(repository);
  const root = await realpath(requestedRoot);
  const [headOutput, remoteOutput, statusOutput, trackedStatusOutput] = await Promise.all([
    git(root, ["rev-parse", "HEAD"]),
    git(root, ["config", "--get", "remote.origin.url"]),
    git(root, ["status", "--porcelain"]),
    git(root, ["status", "--porcelain", "--untracked-files=no"])
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
      working_tree_dirty: statusOutput === null ? null : statusOutput.length > 0,
      tracked_tree_dirty: trackedStatusOutput === null ? null : trackedStatusOutput.length > 0
    },
    includedPaths,
    excludedPaths: new Set(
      excludedPaths.flatMap((path) => {
        const normalized = normalizeExcludedPath(path, requestedRoot, root);
        return normalized === null ? [] : [normalized];
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

// src/score.ts
import { readFile as readFile3 } from "fs/promises";
import { join as join2 } from "path";

// src/evidence.ts
import { lstat, readFile as readFile2, realpath as realpath2, stat } from "fs/promises";
import { basename, resolve as resolve3, sep as sep2 } from "path";
import fg2 from "fast-glob";
import { parse as parse2 } from "yaml";
var maxContentFileBytes = 512e3;
var maxContentFiles = 250;
var maxContentTotalBytes = 5e6;
var namedOwnerRolePattern = /^(.{2,80})\s+(?:team|owners?|reviewers?|maintainers?)$/i;
var ownerRoleAssignmentPattern = /^(?:owner|reviewer|maintainer|team)\s*[:=-]\s*(.{2,80})$/i;
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
async function evaluateOwnershipMap(context, check) {
  const files = await readSearchableFiles(context, check.patterns);
  const inspected = files.map(({ path, text }) => ({
    path,
    entries: ownershipEntries(path, text)
  }));
  const qualifying = inspected.filter(({ entries }) => entries > 0);
  const entryCount = qualifying.reduce((total, { entries }) => total + entries, 0);
  return result(
    check.type,
    check.scope,
    qualifying.length > 0 ? "met" : "not_met",
    `${qualifying.length} ownership mapping file(s) with ${entryCount} structurally identifiable assignment(s) across ${files.length} candidate file(s)`,
    qualifying.map(({ path }) => path)
  );
}
function ownershipEntries(path, text) {
  const name = basename(path).toLowerCase();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("#"));
  if (name === "codeowners") {
    return lines.filter((line) => {
      const fields = line.split(/\s+/);
      return fields.length >= 2 && fields.slice(1).some(isOwnerContact);
    }).length;
  }
  if (["owners", "owners.md", "maintainers", "maintainers.md"].includes(name)) {
    return lines.filter(isConventionalOwnerListEntry).length;
  }
  return markdownOwnershipRows(lines) + explicitOwnershipMappings(lines);
}
function markdownOwnershipRows(lines) {
  let entries = 0;
  for (let index = 0; index < lines.length - 2; index += 1) {
    const columns = ownershipTableColumns(lines[index] ?? "", lines[index + 1] ?? "");
    if (!columns) continue;
    entries += countOwnershipTableRows(lines, index + 2, columns);
  }
  return entries;
}
function ownershipTableColumns(headerLine, separatorLine) {
  const header = markdownCells(headerLine);
  const separator = markdownCells(separatorLine);
  if (header.length < 2 || separator.length !== header.length) return null;
  if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) return null;
  const scope = header.findIndex(
    (cell) => /\b(path|component|module|area|scope|repository)\b/i.test(cell)
  );
  const owner = header.findIndex((cell) => /\b(owner|reviewer|maintainer|team)\b/i.test(cell));
  return scope < 0 || owner < 0 ? null : { count: header.length, owner, scope };
}
function countOwnershipTableRows(lines, start, columns) {
  let entries = 0;
  for (let index = start; index < lines.length; index += 1) {
    const row = markdownCells(lines[index] ?? "");
    if (row.length !== columns.count) break;
    const scope = row[columns.scope] ?? "";
    const owner = row[columns.owner] ?? "";
    if (scope.length > 0 && isOwnerReference(owner)) entries += 1;
  }
  return entries;
}
function markdownCells(line) {
  if (!line.includes("|")) return [];
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}
function explicitOwnershipMappings(lines) {
  return lines.filter((line) => {
    const mapping = parseOwnershipMapping(line);
    if (!mapping) return false;
    const { owner, target } = mapping;
    return isOwnershipTarget(target) && isOwnerReference(owner);
  }).length;
}
function isOwnershipTarget(value) {
  const target = value.trim();
  if (/^(?:all files|default|entire repository|global|repo|repository|root)$/i.test(target)) {
    return true;
  }
  if (/^(?:area|component|module|path|scope)\s+\S+/i.test(target)) return true;
  if (/^(?:\.{0,2}\/|\/)/.test(target) || /[/*]/.test(target)) return true;
  return /^[a-z0-9_.-]+\.[a-z0-9]{1,10}$/i.test(target);
}
function parseOwnershipMapping(line) {
  const normalized = line.replace(/^[-*]\s*/, "").trim();
  const separators = ["=>", "->", ":"];
  const separator = separators.map((value) => ({ index: normalized.indexOf(value), value })).filter(({ index }) => index > 0).sort((left, right) => left.index - right.index)[0];
  if (!separator) return null;
  const target = normalized.slice(0, separator.index).trim();
  const owner = normalized.slice(separator.index + separator.value.length).trim();
  if (target.length === 0 || target.length > 100 || owner.length === 0 || owner.length > 120) {
    return null;
  }
  return { owner, target };
}
function isOwnerReference(value) {
  const normalized = value.replace(/^[-*]\s*/, "").replace(/[*_`]/g, "").trim();
  if (isPlaceholderOwner(normalized)) return false;
  if (isOwnerContact(normalized)) return true;
  const namedRole = namedOwnerRolePattern.exec(normalized);
  if (namedRole) return !isPlaceholderOwner(namedRole[1] ?? "");
  const roleAssignment = ownerRoleAssignmentPattern.exec(normalized);
  return roleAssignment ? !isPlaceholderOwner(roleAssignment[1] ?? "") : false;
}
function isConventionalOwnerListEntry(value) {
  const normalized = value.replace(/^[-*]\s*/, "").trim();
  return !isPlaceholderOwner(normalized) && isOwnerContact(normalized);
}
function isOwnerContact(value) {
  return /(^|\s)@[a-z0-9][a-z0-9_/-]*/i.test(value) || hasEmailContact(value);
}
function hasEmailContact(value) {
  return value.split(/\s+/).some((token) => {
    const at = token.indexOf("@");
    const dot = token.indexOf(".", at + 2);
    return at > 0 && dot > at + 1 && dot < token.length - 1;
  });
}
function isPlaceholderOwner(value) {
  return /^(?:tbd|to be (?:assigned|determined)|unassigned|n\/?a|none|unknown|pending|vacant|-+)$/i.test(
    value
  );
}
async function readSearchableFiles(context, patterns, maxFilesPerPattern) {
  const root = context.metadata.root;
  const paths = maxFilesPerPattern ? await prioritizedMatches(context, patterns, maxFilesPerPattern) : (await matches(context, patterns)).slice(0, maxContentFiles);
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
async function prioritizedMatches(context, patterns, maxFilesPerPattern) {
  const selected = [];
  const seen = /* @__PURE__ */ new Set();
  const groups = await Promise.all(
    patterns.map(
      async (pattern) => (await matches(context, [pattern])).slice(0, maxFilesPerPattern)
    )
  );
  for (let candidateIndex = 0; candidateIndex < maxFilesPerPattern; candidateIndex += 1) {
    for (const group of groups) {
      const path = group[candidateIndex];
      if (!path) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      selected.push(path);
      if (selected.length === maxContentFiles) return selected;
    }
  }
  return selected;
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
  const files = await readSearchableFiles(context, check.files, check.max_files_per_pattern);
  const matchesByFile = files.map(({ path, text }) => ({
    path,
    ...strongestContentMatch(
      text,
      check.terms,
      check.required_any_terms ?? [],
      check.min_terms,
      check.max_span_lines
    )
  }));
  const qualifying = matchesByFile.filter(({ qualifies }) => qualifies);
  const strongest = matchesByFile.reduce((maximum, file) => Math.max(maximum, file.matched), 0);
  const strongestRequired = matchesByFile.reduce(
    (maximum, file) => Math.max(maximum, file.requiredMatched),
    0
  );
  const requiredSummary = check.required_any_terms ? `; strongest required match ${strongestRequired}/${check.required_any_terms.length}` : "";
  const proximitySummary = check.max_span_lines ? ` within ${check.max_span_lines}-line window(s)` : "";
  return result(
    check.type,
    check.scope,
    qualifying.length > 0 ? "met" : "not_met",
    `${qualifying.length} qualifying file(s); strongest co-located match ${strongest}/${check.terms.length} term(s)${requiredSummary}${proximitySummary} across ${files.length} candidate file(s); threshold ${check.min_terms}`,
    qualifying.map(({ path }) => path)
  );
}
async function evaluateContentGroups(context, check) {
  const files = await readSearchableFiles(context, check.files, check.max_files_per_pattern);
  const matchesByFile = files.map(({ path, text }) => ({
    path,
    ...strongestGroupMatch(text, check.groups, check.min_groups, check.max_span_lines)
  }));
  const qualifying = matchesByFile.filter(({ qualifies }) => qualifies);
  const strongest = matchesByFile.reduce(
    (maximum, candidate) => candidate.matchedGroups.length > maximum.matchedGroups.length ? candidate : maximum,
    { path: null, matchedGroups: [], qualifies: false }
  );
  const matched = new Set(strongest.matchedGroups);
  const missing = check.groups.map(({ id }) => id).filter((id) => !matched.has(id));
  const proximitySummary = check.max_span_lines ? ` within ${check.max_span_lines}-line window(s)` : "";
  const partialReferences = qualifying.length > 0 ? qualifying.map(({ path }) => path) : matchesByFile.filter(({ matchedGroups }) => matchedGroups.length === strongest.matchedGroups.length).filter(({ matchedGroups }) => matchedGroups.length > 0).map(({ path }) => path);
  return result(
    check.type,
    check.scope,
    qualifying.length > 0 ? "met" : "not_met",
    `${qualifying.length} qualifying file(s); strongest semantic coverage ${strongest.matchedGroups.length}/${check.groups.length} group(s)${proximitySummary} across ${files.length} candidate file(s); matched: ${strongest.matchedGroups.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}; threshold ${check.min_groups}`,
    partialReferences
  );
}
function strongestGroupMatch(text, groups, minGroups, maxSpanLines) {
  if (!maxSpanLines) {
    const lines2 = text.split(/\r?\n/);
    const matchedGroups = groups.filter(
      ({ terms }) => terms.some((term) => lines2.some((line) => containsPositiveTerm(line, term)))
    ).map(({ id }) => id);
    return { matchedGroups, qualifies: matchedGroups.length >= minGroups };
  }
  const groupCounts = groups.map(() => 0);
  const lines = text.split(/\r?\n/);
  let strongestGroups = [];
  const update = (line, direction) => {
    groups.forEach(({ terms }, index) => {
      if (terms.some((term) => containsPositiveTerm(line, term))) {
        groupCounts[index] = (groupCounts[index] ?? 0) + direction;
      }
    });
  };
  for (let index = 0; index < lines.length; index += 1) {
    update(lines[index] ?? "", 1);
    if (index >= maxSpanLines) update(lines[index - maxSpanLines] ?? "", -1);
    const activeGroups = groups.filter((_, groupIndex) => (groupCounts[groupIndex] ?? 0) > 0).map(({ id }) => id);
    if (activeGroups.length > strongestGroups.length) strongestGroups = activeGroups;
  }
  return { matchedGroups: strongestGroups, qualifies: strongestGroups.length >= minGroups };
}
async function evaluateCiCommand(context, check) {
  const patterns = check.providers.flatMap(({ files: files2 }) => files2);
  const files = await readSearchableFiles(context, patterns, check.max_files_per_pattern);
  const providerPaths = await Promise.all(
    check.providers.map(async (provider) => ({
      id: provider.id,
      paths: new Set(await matches(context, provider.files))
    }))
  );
  const inspected = files.map(({ path, text }) => {
    const invocations = providerPaths.flatMap(
      ({ id, paths }) => paths.has(path) ? ciIntegrationInvocations(id, text) : []
    );
    const matchedTerms = check.terms.filter(
      (term) => invocations.some((invocation) => invocationMatchesTerm(invocation, term))
    );
    return { path, matchedTerms };
  });
  const qualifying = inspected.filter(({ matchedTerms }) => matchedTerms.length >= check.min_terms);
  const strongest = inspected.reduce(
    (maximum, candidate) => candidate.matchedTerms.length > maximum.matchedTerms.length ? candidate : maximum,
    { path: "", matchedTerms: [] }
  );
  return result(
    check.type,
    check.scope,
    qualifying.length > 0 ? "met" : "not_met",
    `${qualifying.length} CI configuration file(s) contain an enabled integration-triggered scanner invocation; strongest executable match ${strongest.matchedTerms.length}/${check.terms.length} term(s) across ${files.length} candidate file(s); threshold ${check.min_terms}`,
    qualifying.map(({ path }) => path)
  );
}
function ciIntegrationInvocations(provider, text) {
  try {
    const document = asRecord(parse2(text, { maxAliasCount: 50 }));
    if (!document) return [];
    if (provider === "github-actions") return githubIntegrationInvocations(document);
    if (provider === "gitlab-ci") return gitlabIntegrationInvocations(document);
    return azureIntegrationInvocations(document);
  } catch {
    return [];
  }
}
function githubIntegrationInvocations(document) {
  const events = namedTriggers(document.on, ["pull_request", "merge_group"]);
  if (events.size === 0) return [];
  const jobs = asRecord(document.jobs);
  if (!jobs) return [];
  return Object.values(jobs).flatMap((job) => githubJobInvocations(job, events));
}
function githubJobInvocations(value, parentEvents) {
  const job = asRecord(value);
  if (!job || isDisabledCiNode(job)) return [];
  const events = githubConditionEvents(job.if, parentEvents);
  if (events.size === 0) return [];
  const reusableWorkflow = invocationFromField(job, "uses", "action");
  return [
    ...reusableWorkflow ? [reusableWorkflow] : [],
    ...asArray(job.steps).flatMap((step) => githubStepInvocations(step, events))
  ];
}
function githubStepInvocations(value, parentEvents) {
  const step = asRecord(value);
  if (!step || isDisabledCiNode(step)) return [];
  if (githubConditionEvents(step.if, parentEvents).size === 0) return [];
  const action = invocationFromField(step, "uses", "action");
  const command = invocationFromField(step, "run", "command");
  return [action, command].filter((invocation) => invocation !== null);
}
function invocationFromField(node, field, kind) {
  const value = node[field];
  return typeof value === "string" ? { kind, value } : null;
}
function gitlabIntegrationInvocations(document) {
  const workflow = asRecord(document.workflow);
  const workflowAllowsMergeRequests = hasGitlabMergeRequestRule(workflow?.rules);
  const reserved = /* @__PURE__ */ new Set([
    "after_script",
    "before_script",
    "cache",
    "default",
    "image",
    "include",
    "services",
    "stages",
    "variables",
    "workflow"
  ]);
  const invocations = [];
  for (const [name, jobValue] of Object.entries(document)) {
    if (name.startsWith(".") || reserved.has(name)) continue;
    const job = asRecord(jobValue);
    if (!job || isDisabledCiNode(job)) continue;
    if (hasNamedTrigger(job.except, ["merge_requests"])) continue;
    const hasJobTriggerRules = asArray(job.rules).length > 0 || job.only !== void 0;
    const jobAllowsMergeRequests = hasGitlabMergeRequestRule(job.rules) || hasNamedTrigger(job.only, ["merge_requests"]);
    if (hasJobTriggerRules ? !jobAllowsMergeRequests : !workflowAllowsMergeRequests) continue;
    for (const command of stringValues(job.script)) {
      invocations.push({ kind: "command", value: command });
    }
  }
  return invocations;
}
function azureIntegrationInvocations(document) {
  if (!hasAzurePullRequestTrigger(document.pr)) return [];
  return collectAzureInvocations(document);
}
function collectAzureInvocations(node) {
  if (isDisabledCiNode(node) || !azureConditionAllowsPullRequest(node.condition)) return [];
  const invocations = [];
  for (const field of ["script", "bash", "pwsh", "powershell", "command"]) {
    if (typeof node[field] === "string") {
      invocations.push({ kind: "command", value: node[field] });
    }
  }
  for (const collection of ["stages", "jobs", "steps"]) {
    for (const childValue of asArray(node[collection])) {
      const child = asRecord(childValue);
      if (child) invocations.push(...collectAzureInvocations(child));
    }
  }
  return invocations;
}
function hasNamedTrigger(value, names) {
  if (typeof value === "string") return names.includes(value.toLowerCase());
  if (Array.isArray(value)) {
    return value.some((entry) => typeof entry === "string" && names.includes(entry.toLowerCase()));
  }
  const record = asRecord(value);
  if (!record) return false;
  if (names.some((name) => Object.hasOwn(record, name))) return true;
  return Object.hasOwn(record, "refs") && hasNamedTrigger(record.refs, names);
}
function namedTriggers(value, names) {
  return new Set(names.filter((name) => hasNamedTrigger(value, [name])));
}
function githubConditionEvents(value, parentEvents) {
  if (typeof value !== "string") return new Set(parentEvents);
  const condition = value.toLowerCase();
  if (!condition.includes("github.event_name")) return new Set(parentEvents);
  const equals = [...condition.matchAll(/github\.event_name\s*==\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? ""
  );
  const excludes = [...condition.matchAll(/github\.event_name\s*!=\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? ""
  );
  if (equals.length === 0 && excludes.length === 0) return /* @__PURE__ */ new Set();
  const candidates = equals.length > 0 ? equals.filter((event) => parentEvents.has(event)) : [...parentEvents];
  return new Set(candidates.filter((event) => !excludes.includes(event)));
}
function hasGitlabMergeRequestRule(value) {
  for (const ruleValue of asArray(value)) {
    const rule = asRecord(ruleValue);
    if (!rule) return false;
    if (typeof rule.if !== "string") return !isDisabledCiNode(rule);
    const comparison = /\bci_pipeline_source\s*(==|!=)\s*['"]([^'"]+)['"]/i.exec(rule.if);
    if (!comparison) return false;
    const operator = comparison[1];
    const event = comparison[2]?.toLowerCase();
    const matchesMergeRequest = operator === "==" ? event === "merge_request_event" : event !== "merge_request_event";
    if (matchesMergeRequest) return !isDisabledCiNode(rule);
  }
  return false;
}
function hasAzurePullRequestTrigger(value) {
  if (value === false || value === null || value === void 0) return false;
  if (typeof value === "string") return !["none", "false"].includes(value.toLowerCase());
  if (Array.isArray(value)) return value.length > 0;
  const trigger = asRecord(value);
  if (!trigger) return false;
  const branches = asRecord(trigger.branches);
  if (!branches) return true;
  const include = stringValues(branches.include).map((branch) => branch.toLowerCase());
  const exclude = stringValues(branches.exclude).map((branch) => branch.toLowerCase());
  if (exclude.includes("*")) return false;
  if (include.length > 0) return include.some((branch) => !["none", "false"].includes(branch));
  return true;
}
function azureConditionAllowsPullRequest(value) {
  if (value === void 0) return true;
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const condition = value.toLowerCase().replace(/\s+/g, "");
  if (["always()", "succeeded()", "succeededorfailed()"].includes(condition)) return true;
  const direct = azureReasonComparison(condition);
  if (direct !== null) return direct;
  const conjunction = /^and\((?:always|succeeded|succeededorfailed)\(\),(.+)\)$/.exec(condition);
  return conjunction ? azureReasonComparison(conjunction[1] ?? "") === true : false;
}
function azureReasonComparison(condition) {
  const comparison = /^(eq|ne)\(variables\[['"]build\.reason['"]\],['"]([^'"]+)['"]\)$/.exec(
    condition
  );
  if (!comparison) return null;
  const equalsPullRequest = comparison[2] === "pullrequest";
  return comparison[1] === "eq" ? equalsPullRequest : !equalsPullRequest;
}
function isDisabledCiNode(node) {
  if (node.enabled === false || node.allow_failure === true || asRecord(node.allow_failure) !== null || node["continue-on-error"] === true || node.continueonerror === true || node.continueOnError === true) {
    return true;
  }
  if (typeof node.when === "string" && ["never", "manual"].includes(node.when.toLowerCase())) {
    return true;
  }
  return [node.if, node.condition].some((condition) => {
    if (condition === false) return true;
    if (typeof condition !== "string") return false;
    const normalized = condition.toLowerCase().replace(/[\s${}]/g, "");
    return normalized === "false" || normalized === "0" || normalized === "never";
  });
}
function invocationMatchesTerm(invocation, term) {
  if (invocation.kind === "action") {
    const identity = invocation.value.split("@", 1)[0] ?? "";
    return actionIdentityMatchesTerm(identity, term);
  }
  return shellStatements(invocation.value).some((statement) => {
    if (statement.includes("||") || /(^|[^|])\|(?!\|)/.test(statement)) return false;
    const commands = statement.split("&&").map((command) => command.trim());
    for (const rawCommand of commands) {
      const command = rawCommand.replace(/^(?:[a-z_][a-z0-9_]*=[^\s]+\s+)*/i, "").trim();
      if (/^(?:false|exit\s+[1-9]\d*)$/i.test(command)) return false;
      if (commandMatchesTerm(command, term)) return true;
    }
    return false;
  });
}
function commandMatchesTerm(command, term) {
  if (!command || /^(?:echo|printf|write-host|write-output|cat|grep|rg|sed|awk)\b/i.test(command)) {
    return false;
  }
  const executable = command.split(/\s+/, 1)[0] ?? "";
  if (executableMatchesTerm(executable, term)) return true;
  if (!/^(?:npx|pipx|sudo|uvx)\b/i.test(executable)) return false;
  const delegatedExecutable = command.split(/\s+/)[1] ?? "";
  return executableMatchesTerm(delegatedExecutable, term);
}
function actionIdentityMatchesTerm(identity, term) {
  const alias = normalizedExecutableAlias(term);
  return identity.toLowerCase().split("/").some((segment) => segment === alias || segment === `${alias}-action`);
}
function executableMatchesTerm(executable, term) {
  const name = executable.split("/").at(-1)?.replace(/\.exe$/i, "").toLowerCase() ?? "";
  return name === normalizedExecutableAlias(term);
}
function normalizedExecutableAlias(term) {
  return term.trim().toLowerCase().replace(/[\s_]+/g, "-");
}
function shellStatements(value) {
  return value.split(/\r?\n|;/).map((statement) => statement.trim()).filter((statement) => statement.length > 0 && !statement.startsWith("#"));
}
function stringValues(value) {
  if (typeof value === "string") return [value];
  return asArray(value).filter((entry) => typeof entry === "string");
}
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function strongestContentMatch(text, terms, requiredTerms, minTerms, maxSpanLines) {
  if (!maxSpanLines) {
    const matched = terms.filter((term) => containsTerm(text, term)).length;
    const requiredMatched = requiredTerms.filter((term) => containsTerm(text, term)).length;
    return {
      matched,
      requiredMatched,
      qualifies: matched >= minTerms && (requiredTerms.length === 0 || requiredMatched > 0)
    };
  }
  const termCounts = terms.map(() => 0);
  const requiredCounts = requiredTerms.map(() => 0);
  const lines = text.split(/\r?\n/);
  let strongest = 0;
  let strongestRequired = 0;
  let qualifies = false;
  const update = (line, direction) => {
    terms.forEach((term, index) => {
      if (containsTerm(line, term)) termCounts[index] = (termCounts[index] ?? 0) + direction;
    });
    requiredTerms.forEach((term, index) => {
      if (containsTerm(line, term)) {
        requiredCounts[index] = (requiredCounts[index] ?? 0) + direction;
      }
    });
  };
  for (let index = 0; index < lines.length; index += 1) {
    update(lines[index] ?? "", 1);
    if (index >= maxSpanLines) update(lines[index - maxSpanLines] ?? "", -1);
    const matched = termCounts.filter((count) => count > 0).length;
    const requiredMatched = requiredCounts.filter((count) => count > 0).length;
    strongest = Math.max(strongest, matched);
    strongestRequired = Math.max(strongestRequired, requiredMatched);
    if (matched >= minTerms && (requiredTerms.length === 0 || requiredMatched > 0)) {
      qualifies = true;
    }
  }
  return { matched: strongest, requiredMatched: strongestRequired, qualifies };
}
function containsTerm(text, term) {
  const pattern = termPattern(term);
  return new RegExp(`(^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, "i").test(text);
}
function containsPositiveTerm(text, term) {
  const pattern = termPattern(term);
  const expression = new RegExp(`(^|[^a-z0-9])(${pattern})(?=$|[^a-z0-9])`, "gi");
  for (const match of text.matchAll(expression)) {
    const termStart = match.index + (match[1]?.length ?? 0);
    const prefix = text.slice(Math.max(0, termStart - 12), termStart);
    if (!/\b(?:no|not)\s+$/i.test(prefix)) return true;
  }
  return false;
}
function termPattern(term) {
  return term.trim().split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s_-]+");
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
    case "ownership_map":
      return evaluateOwnershipMap(context, check);
    case "content_any":
    case "content_all":
      return evaluateLegacyContent(context, check);
    case "content_terms":
      return evaluateContentTerms(context, check);
    case "content_groups":
      return evaluateContentGroups(context, check);
    case "ci_command":
      return evaluateCiCommand(context, check);
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
function evidenceChecksPass(control, evidence) {
  return control.evidence_mode === "any" ? evidence.some(({ status }) => status === "met") : evidence.every(({ status }) => status === "met");
}
function repositoryEvidencePasses(control, evidence, checksPassed) {
  const hasRepositoryMatch = evidence.some(
    ({ scope, status }) => scope === "repository" && status === "met"
  );
  const hasManualCheck = control.evidence.some(({ type }) => type === "manual");
  return checksPassed && hasRepositoryMatch && (!hasManualCheck || control.evidence_mode === "any");
}
function externalEvidenceConflicts(attestation, agentEvidence) {
  const attestationStatus = attestation?.status === "unknown" ? null : attestation?.status ?? null;
  return agentEvidence !== null && agentEvidence.status !== "unknown" && attestationStatus !== null && agentEvidence.status !== attestationStatus;
}
function supplementalResolution(attestation, agentEvidence) {
  if (externalEvidenceConflicts(attestation, agentEvidence)) {
    return { confidence: "none", status: "unknown" };
  }
  if (agentEvidence && agentEvidence.status !== "unknown") {
    return { confidence: "agent-collected", status: agentEvidence.status };
  }
  if (attestation) return { confidence: "attested", status: attestation.status };
  if (agentEvidence?.status === "unknown") {
    return { confidence: "agent-collected", status: "unknown" };
  }
  return null;
}
function resolveControl(control, evidence, attestation, agentEvidence) {
  const checksPassed = evidenceChecksPass(control, evidence);
  if (repositoryEvidencePasses(control, evidence, checksPassed)) {
    return { confidence: "repository-detected", status: "met" };
  }
  const supplemental = supplementalResolution(attestation, agentEvidence);
  if (supplemental) return supplemental;
  const hasUnknownCheck = evidence.some(({ status }) => status === "unknown");
  if (hasUnknownCheck) return { confidence: "none", status: "unknown" };
  return { confidence: "none", status: checksPassed ? "met" : "not_met" };
}
async function evaluateControl(context, control, attestations, agentClaim, now = /* @__PURE__ */ new Date()) {
  const evidence = await Promise.all(
    control.evidence.map(async (check) => evaluateCheck(context, check))
  );
  const attestation = activeAttestation(control, attestations, now);
  const agentEvidence = activeAgentEvidence(control, agentClaim, now);
  const { confidence, status } = resolveControl(control, evidence, attestation, agentEvidence);
  return {
    id: control.id,
    dimension: control.dimension,
    level: control.level,
    title: control.title,
    outcome: control.outcome,
    risk: control.risk,
    status,
    confidence,
    ...control.evidence_mode === "any" ? { evidence_mode: "any" } : {},
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
function usesModernEvidence(version) {
  return version === "0.3.0" || version === "0.4.0";
}
function reportSchemaVersion(version) {
  if (usesModernEvidence(version)) {
    return version;
  }
  return "0.2.0";
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
function isRepositoryDetectable(control) {
  const repositoryChecks = control.evidence.filter(({ scope }) => scope === "repository");
  return control.evidence_mode === "any" ? repositoryChecks.length > 0 : repositoryChecks.length === control.evidence.length;
}
function repositoryScore(catalog, results, dimensions) {
  let achieved = 0;
  let ceiling = 0;
  const resultsById = new Map(results.map((result2) => [result2.id, result2]));
  for (const { id: dimension } of dimensions) {
    let dimensionAchieved = 0;
    let dimensionCeiling = 0;
    let achievedOpen = true;
    let ceilingOpen = true;
    for (const level of [1, 2, 3, 4]) {
      const controlsAtLevel = catalog.filter(
        (control) => control.dimension === dimension && control.level === level
      );
      const repositoryDetectable = controlsAtLevel.every(isRepositoryDetectable);
      if (ceilingOpen && repositoryDetectable) {
        dimensionCeiling = level;
      } else {
        ceilingOpen = false;
      }
      const repositoryEstablished = controlsAtLevel.every((control) => {
        const result2 = resultsById.get(control.id);
        return result2?.status === "met" && result2.confidence === "repository-detected";
      });
      if (achievedOpen && repositoryDetectable && repositoryEstablished) {
        dimensionAchieved = level;
      } else {
        achievedOpen = false;
      }
    }
    achieved += dimensionAchieved;
    ceiling += dimensionCeiling;
  }
  return {
    achieved,
    ceiling,
    percentage: ceiling === 0 ? 0 : Math.round(achieved / ceiling * 100)
  };
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
    const requiredControls = controls.filter(
      (control) => control.level <= profile.floors[control.dimension] && controlPasses(control)
    );
    return {
      id: profile.id,
      title: profile.title,
      passed: blockers.length === 0,
      blockers,
      ...usesModernEvidence(benchmark.version) ? {
        evidence_dependencies: {
          agent_collected: requiredControls.filter(
            ({ confidence }) => confidence === "agent-collected"
          ).length,
          attested: requiredControls.filter(({ confidence }) => confidence === "attested").length
        }
      } : {}
    };
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
  const modernEvidence = usesModernEvidence(benchmark.version);
  const schemaVersion = reportSchemaVersion(benchmark.version);
  const context = await createRepositoryContext(repo, scope, options.excludedPaths);
  await validateAgentEvidence(benchmark, catalog, context, options.agentEvidence ?? null, now);
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
  const warnings = [...options.warnings ?? []];
  if (modernEvidence) {
    if (scope === "tracked" && context.metadata.tracked_tree_dirty) {
      warnings.push(
        "Tracked assessment includes uncommitted tracked-file contents, so the result is not reproducible from git_head alone. Use a clean worktree before comparing scores or collecting agent evidence."
      );
    }
    const hasActiveSupplementalEvidence = controls.some(
      ({ agent_evidence: agentEvidence, attestation }) => agentEvidence !== null || attestation !== null
    );
    const unresolvedExternalOrOutcome = controls.some(
      ({ evidence, status }) => (status === "unknown" || status === "not_met") && evidence.some(
        ({ scope: evidenceScope }) => ["platform", "organization", "outcome"].includes(evidenceScope)
      )
    );
    if (!hasActiveSupplementalEvidence && unresolvedExternalOrOutcome) {
      warnings.push(
        "Repository-only baseline: no active agent-collected or human-attested evidence was supplied. Platform, organization, and outcome evidence remains unresolved until authorized evidence is collected with init-evidence or supplied by accountable owners."
      );
    }
  }
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
  const repository = modernEvidence ? repositoryScore(catalog, controls, benchmark.dimensions) : void 0;
  const highestProfile = [...profiles].reverse().find(({ passed }) => passed)?.id ?? null;
  const targetPassed = profiles.find(({ id }) => id === profileId)?.passed ?? false;
  return {
    schema_version: schemaVersion,
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
    ...modernEvidence ? { warnings } : {},
    score: {
      total,
      maximum: 40,
      percentage: Math.round(total / 40 * 100),
      ...repository ? { repository } : {}
    },
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
      unknown: controls.filter(({ status }) => status === "unknown").length,
      ...modernEvidence ? {
        resolved: controls.filter(({ status }) => status !== "unknown").length,
        total: controls.length
      } : {}
    },
    dimensions,
    controls,
    profiles,
    readiness: { highest_profile: highestProfile, target_passed: targetPassed },
    limitations: [
      scope === "tracked" ? "Tracked mode considers only Git-tracked paths, using current working-tree contents; uncommitted edits to tracked files can affect the result." : "Workspace mode includes untracked local files and is provisional; do not compare it directly with tracked-mode reports.",
      "Repository-detected evidence proves a qualifying artifact match, not consistent practice or external enforcement.",
      ...modernEvidence ? [
        "Repository-detected progress uses only deterministic offline evidence and its attainable ceiling; it is explanatory and does not replace the normative score or readiness floors.",
        "Agent-collected repository evidence is semantic, target-bound, and source-backed but is not independently verified or relabelled as repository-detected."
      ] : [],
      "Agent-collected evidence and human attestations are reported separately and are not independently verified.",
      "This assessment does not grant production access, deployment authority, or certification."
    ]
  };
}
async function validateAgentEvidence(benchmark, catalog, context, evidence, now) {
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
  if (usesModernEvidence(benchmark.version) && context.metadata.tracked_tree_dirty) {
    throw new Error(
      `ADRB v${benchmark.version} agent evidence requires tracked files to match the bound commit`
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
    const manualScopes = control.evidence.filter(({ type }) => type === "manual").map(({ scope: evidenceScope }) => evidenceScope);
    const allowedScopes = control.agent_evidence_scopes.length > 0 ? control.agent_evidence_scopes : manualScopes;
    if (!allowedScopes.includes(claim.scope)) {
      throw new Error(`${controlId} does not accept ${claim.scope} evidence`);
    }
    if (claim.scope === "repository") {
      if (context.includedPaths === null) {
        throw new Error(
          `${controlId} uses repository-scoped agent evidence, which requires --scope tracked`
        );
      }
      for (const reference of claim.references) {
        const parsedReference = repositoryReference(reference);
        if (!parsedReference || !context.includedPaths.has(parsedReference.path) || context.excludedPaths.has(parsedReference.path)) {
          throw new Error(`${controlId} references an unavailable tracked path: ${reference}`);
        }
        if (parsedReference.lines) {
          const contents = await readFile3(
            join2(context.metadata.root, parsedReference.path),
            "utf8"
          );
          const lineCount = countLines(contents);
          if (parsedReference.lines.start < 1 || parsedReference.lines.end < parsedReference.lines.start) {
            throw new Error(`${controlId} references an invalid line range: ${reference}`);
          }
          if (parsedReference.lines.end > lineCount) {
            throw new Error(
              `${controlId} references lines beyond ${parsedReference.path}'s ${lineCount} lines: ${reference}`
            );
          }
        }
      }
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
function repositoryReference(reference) {
  if (!reference.startsWith("repo:")) return null;
  const withoutPrefix = reference.slice("repo:".length);
  const lineMatch = withoutPrefix.match(/#L(\d+)(?:-L?(\d+))?$/);
  const path = lineMatch ? withoutPrefix.slice(0, lineMatch.index) : withoutPrefix;
  if (path.length === 0 || path.startsWith("/") || path.includes("#") || path.includes("\\") || path.split("/").some((part) => part === ".." || part === ".")) {
    return null;
  }
  const start = lineMatch ? Number(lineMatch[1]) : null;
  const end = lineMatch ? Number(lineMatch[2] ?? lineMatch[1]) : null;
  return {
    path,
    lines: start === null || end === null ? null : { start, end }
  };
}
function countLines(contents) {
  if (contents.length === 0) return 0;
  const lines = contents.split("\n").length;
  return contents.endsWith("\n") ? lines - 1 : lines;
}

// src/cli.ts
var program = new Command();
program.name("agentic-scorecard").description("Evidence-backed readiness assessment for agentic software development harnesses").version("0.4.0");
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
  const path = join3(repo, ".agentic", "attestations.yaml");
  if (!options.force) {
    try {
      await readFile4(path, "utf8");
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
    controls.filter(
      (control) => control.allow_attestation && control.evidence.some(({ type }) => type === "manual")
    ).map((control) => {
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
program.command("init-evidence").argument("[repository]", "repository to prepare external evidence for", ".").option("--output <path>", "agent evidence bundle path").option("--request-output <path>", "human-readable evidence request path").option("--force", "replace an existing agent evidence bundle", false).description("Create a target-bound template for unresolved agent-collected evidence").action(
  async (repository, options) => {
    const repo = resolve4(repository);
    const path = resolve4(options.output ?? join3(repo, ".agentic", "agent-evidence.yaml"));
    const requestPath = resolve4(
      options.requestOutput ?? join3(repo, ".agentic", "evidence-request.md")
    );
    if (path === requestPath) {
      throw new Error("Agent evidence bundle and request paths must be different");
    }
    if (!options.force) {
      for (const candidate of [path, requestPath]) {
        try {
          await readFile4(candidate, "utf8");
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
    if (context.metadata.tracked_tree_dirty) {
      throw new Error(
        "init-evidence requires tracked files to match HEAD so every claim binds to the exact assessed commit."
      );
    }
    const baseline = await assess(repo, benchmark, controls, "read-only-analysis", {
      scope: "tracked"
    });
    const unresolved = new Set(
      baseline.controls.filter(({ status }) => status !== "met" && status !== "not_applicable").map(({ id }) => id)
    );
    const eligibleControls = controls.filter(
      ({ allow_agent_evidence: allowed, id }) => allowed && unresolved.has(id)
    );
    const bundle = {
      schema_version: benchmark.version,
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
        `# ADRB v${benchmark.version} evidence request`,
        "",
        `- Repository: ${bundle.target.repository}`,
        `- Git commit: ${bundle.target.git_head ?? "unavailable"}`,
        `- Benchmark: ${benchmark.version}`,
        "",
        "Repository claims may cite only tracked paths from the bound commit and remain agent-collected, not repository-detected. Obtain authorization before accessing connected systems. Use read-only, least-privileged tools. Add only attempted claims to the bundle; partial or inconclusive evidence remains `unknown`. Never paste source excerpts, secrets, prompts, personal data, or raw sensitive content.",
        "",
        ...eligibleControls.flatMap((control) => {
          const manualCheck = control.evidence.find(
            (check) => check.type === "manual"
          );
          const scopes = control.agent_evidence_scopes.length > 0 ? control.agent_evidence_scopes : [manualCheck?.scope ?? "organization"];
          return [
            `## ${control.id} \u2014 ${control.title}`,
            "",
            `- Scope: ${scopes.join(", ")}`,
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
program.command("assess").argument("[repository]", "repository to assess", ".").option("--profile <profile>", "target autonomy profile", "pr-creation").option("--format <format>", "json or markdown", "markdown").option("--output <path>", "write the report to a file").option("--attestations <path>", "manual attestation file").option("--agent-evidence <path>", "agent-collected repository or external evidence bundle").option("--scope <scope>", "tracked or workspace", "tracked").option("--enforce", "exit non-zero when the target profile fails", false).option("--github-output", "append summary values to $GITHUB_OUTPUT", false).description("Assess a repository using local, read-only evidence collection").action(
  async (repository, options) => {
    if (!["json", "markdown"].includes(options.format)) {
      throw new Error("--format must be json or markdown");
    }
    if (!["tracked", "workspace"].includes(options.scope)) {
      throw new Error("--scope must be tracked or workspace");
    }
    const repo = resolve4(repository);
    const { benchmark, controls } = await loadBenchmark();
    const warnings = [];
    const attestationPath = resolve4(
      options.attestations ?? join3(repo, ".agentic", "attestations.yaml")
    );
    const attestations = await loadAttestations(attestationPath, benchmark.version, {
      ignoreVersionMismatch: options.attestations === void 0,
      onWarning: (warning) => warnings.push(warning)
    });
    const agentEvidencePath = resolve4(
      options.agentEvidence ?? join3(repo, ".agentic", "agent-evidence.yaml")
    );
    const agentEvidence = await loadAgentEvidence(agentEvidencePath, benchmark.version, {
      ignoreVersionMismatch: options.agentEvidence === void 0,
      onWarning: (warning) => warnings.push(warning)
    });
    const reportPath = options.output ? resolve4(options.output) : null;
    const report = await assess(repo, benchmark, controls, options.profile, {
      scope: options.scope,
      attestations,
      agentEvidence,
      warnings,
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
repository_score=${report.score.repository?.achieved ?? ""}
repository_ceiling=${report.score.repository?.ceiling ?? ""}
repository_percentage=${report.score.repository?.percentage ?? ""}
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
