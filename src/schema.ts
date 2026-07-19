import { z } from 'zod';

export const dimensionIds = [
  'context',
  'environment',
  'specification',
  'tooling',
  'security',
  'testing',
  'governance',
  'learning',
  'observability',
  'resilience',
] as const;

export const DimensionIdSchema = z.enum(dimensionIds);
export type DimensionId = z.infer<typeof DimensionIdSchema>;

const LevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type Level = z.infer<typeof LevelSchema>;

export const EvidenceScopeSchema = z.enum(['repository', 'platform', 'organization', 'outcome']);
export type EvidenceScope = z.infer<typeof EvidenceScopeSchema>;
const ManualEvidenceScopeSchema = z.enum(['platform', 'organization', 'outcome']);

export const AssessmentScopeSchema = z.enum(['tracked', 'workspace']);
export type AssessmentScope = z.infer<typeof AssessmentScopeSchema>;

const PathAnySchema = z.object({
  type: z.literal('path_any'),
  scope: z.literal('repository').default('repository'),
  patterns: z.array(z.string().min(1)).min(1),
  min_bytes: z.number().int().positive().default(1),
});

const PathAllSchema = z.object({
  type: z.literal('path_all'),
  scope: z.literal('repository').default('repository'),
  patterns: z.array(z.string().min(1)).min(1),
  min_bytes: z.number().int().positive().default(1),
});

const OwnershipMapSchema = z.object({
  type: z.literal('ownership_map'),
  scope: z.literal('repository').default('repository'),
  patterns: z.array(z.string().min(1)).min(1),
});

const ContentAnySchema = z.object({
  type: z.literal('content_any'),
  scope: z.literal('repository').default('repository'),
  files: z.array(z.string().min(1)).min(1),
  needles: z.array(z.string().min(1)).min(1),
});

const ContentAllSchema = z.object({
  type: z.literal('content_all'),
  scope: z.literal('repository').default('repository'),
  files: z.array(z.string().min(1)).min(1),
  needles: z.array(z.string().min(1)).min(1),
});

const ContentTermsSchema = z.object({
  type: z.literal('content_terms'),
  scope: z.literal('repository').default('repository'),
  files: z.array(z.string().min(1)).min(1),
  terms: z.array(z.string().min(1)).min(1),
  min_terms: z.number().int().positive(),
  required_any_terms: z.array(z.string().min(1)).min(1).optional(),
  max_span_lines: z.number().int().positive().max(200).optional(),
  max_files_per_pattern: z.number().int().positive().max(250).optional(),
});

const ContentGroupsSchema = z.object({
  type: z.literal('content_groups'),
  scope: z.literal('repository').default('repository'),
  files: z.array(z.string().min(1)).min(1),
  groups: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        terms: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
  min_groups: z.number().int().positive(),
  max_span_lines: z.number().int().positive().max(200).optional(),
  max_files_per_pattern: z.number().int().positive().max(250).optional(),
});

const CiProviderSchema = z.object({
  id: z.enum(['github-actions', 'gitlab-ci', 'azure-pipelines']),
  files: z.array(z.string().min(1)).min(1),
});

const SourcePatternSchema = z
  .string()
  .min(1)
  .refine((pattern) => {
    try {
      new RegExp(pattern, 'u');
      return true;
    } catch {
      return false;
    }
  }, 'Source patterns must be valid regular expressions');

const CiCommandSignatureSchema = z.object({
  executables: z.array(z.string().min(1)).min(1),
  argument_groups: z.array(z.array(z.string().min(1)).min(1)).min(1),
  source_content_groups: z.array(z.array(z.string().min(1)).min(1)).default([]),
  source_pattern_groups: z.array(z.array(SourcePatternSchema).min(1)).default([]),
  source_max_span_lines: z.number().int().positive().max(200).default(120),
  required_argument_prefixes: z.array(z.array(z.string().min(1)).min(1)).default([]),
  max_arguments: z.number().int().nonnegative().optional(),
  prohibited_arguments: z.array(z.string().min(1)).default([]),
  prohibited_argument_sequences: z.array(z.array(z.string().min(1)).min(2)).default([]),
});

const CiToolSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    commands: z.array(CiCommandSignatureSchema).default([]),
    standalone_executables: z.array(z.string().min(1)).default([]),
    actions: z.array(z.string().regex(/^[^/@\s]+\/[^/@\s]+$/)).default([]),
    prohibited_arguments: z.array(z.string().min(1)).default([]),
    prohibited_argument_sequences: z.array(z.array(z.string().min(1)).min(2)).default([]),
    requires_final_exit_status: z.boolean().default(false),
  })
  .superRefine((tool, context) => {
    const commandConfigured = tool.commands.length > 0 || tool.standalone_executables.length > 0;
    if (!commandConfigured && tool.actions.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'A CI tool must define a command signature, a standalone executable, or a full action identity',
      });
    }
  });

const CiCommandSchema = z.object({
  type: z.literal('ci_command'),
  scope: z.literal('repository').default('repository'),
  providers: z.array(CiProviderSchema).default([]),
  tools: z.array(CiToolSchema).default([]),
  min_tools: z.number().int().positive().default(1),
  max_files_per_pattern: z.number().int().positive().max(250).optional(),
});

const MaxBytesSchema = z.object({
  type: z.literal('max_bytes'),
  scope: z.literal('repository').default('repository'),
  patterns: z.array(z.string().min(1)).min(1),
  max_bytes: z.number().int().positive(),
});

const ManualSchema = z.object({
  type: z.literal('manual'),
  scope: ManualEvidenceScopeSchema.default('organization'),
  prompt: z.string().min(1),
});

export const EvidenceCheckSchema = z.discriminatedUnion('type', [
  PathAnySchema,
  PathAllSchema,
  OwnershipMapSchema,
  ContentAnySchema,
  ContentAllSchema,
  ContentTermsSchema,
  ContentGroupsSchema,
  CiCommandSchema,
  MaxBytesSchema,
  ManualSchema,
]);
export type EvidenceCheck = z.infer<typeof EvidenceCheckSchema>;

const RawControlSchema = z.object({
  id: z.string().regex(/^ADRB-[A-Z]{3}-\d{3}$/),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  title: z.string().min(1),
  outcome: z.string().min(1),
  risk: z.string().min(1),
  evidence: z.array(EvidenceCheckSchema).min(1),
  evidence_mode: z.enum(['all', 'any']).default('all'),
  remediation: z.string().min(1),
  references: z.array(z.string().min(1)).default([]),
  allow_attestation: z.boolean().default(false),
  allow_not_applicable: z.boolean().default(false),
  allow_agent_evidence: z.boolean().default(false),
  agent_evidence_scopes: z.array(EvidenceScopeSchema).default([]),
});

const LegacyRawControlSchema = RawControlSchema.extend({
  allow_attestation: z.boolean().default(true),
});

export const ControlFileSchema = z.object({
  dimension: DimensionIdSchema,
  controls: z.array(RawControlSchema).min(1),
});

export const LegacyControlFileSchema = z.object({
  dimension: DimensionIdSchema,
  controls: z.array(LegacyRawControlSchema).min(1),
});

export type Control = z.infer<typeof RawControlSchema> & { dimension: DimensionId };

const DetectorAdapterExtensionSchema = z
  .object({
    control_id: z.string().regex(/^ADRB-[A-Z]{3}-\d{3}$/),
    evidence_index: z.number().int().nonnegative(),
    patterns: z.array(z.string().min(1)).min(1).optional(),
    files: z.array(z.string().min(1)).min(1).optional(),
    terms: z.array(z.string().min(1)).min(1).optional(),
    required_any_terms: z.array(z.string().min(1)).min(1).optional(),
    ci_providers: z.array(CiProviderSchema).min(1).optional(),
    ci_tools: z.array(CiToolSchema).min(1).optional(),
  })
  .strict()
  .superRefine((extension, context) => {
    const extensionKinds = [
      extension.patterns,
      extension.files,
      extension.terms,
      extension.required_any_terms,
      extension.ci_providers,
      extension.ci_tools,
    ].filter(Boolean).length;
    if (extensionKinds !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'A detector extension must declare exactly one of patterns, files, terms, required_any_terms, ci_providers, or ci_tools',
      });
    }
  });

export const DetectorAdapterSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    benchmark_version: z.string().regex(/^\d+\.\d+\.\d+$/),
    extensions: z.array(DetectorAdapterExtensionSchema).min(1),
  })
  .strict();

export type DetectorAdapter = z.infer<typeof DetectorAdapterSchema>;

const DimensionSchema = z.object({
  id: DimensionIdSchema,
  title: z.string().min(1),
  description: z.string().min(1),
});

const FloorsSchema = z.object(
  Object.fromEntries(dimensionIds.map((dimension) => [dimension, LevelSchema])) as Record<
    DimensionId,
    typeof LevelSchema
  >,
);

const ReadinessProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  description: z.string().min(1),
  floors: FloorsSchema,
});

export const BenchmarkSchema = z.object({
  id: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: z.string().min(1),
  description: z.string().min(1),
  maturity_levels: z.record(z.string(), z.string()),
  dimensions: z.array(DimensionSchema).length(dimensionIds.length),
  readiness_profiles: z.array(ReadinessProfileSchema).min(1),
  scoring: z.object({
    dimension_method: z.literal('consecutive-levels'),
    overall_method: z.literal('sum'),
    maximum_score: z.literal(40),
    readiness_method: z.literal('non-compensating-floors'),
    attestation_counts_as_verified: z.literal(false),
  }),
});

export type Benchmark = z.infer<typeof BenchmarkSchema>;
export type ReadinessProfile = Benchmark['readiness_profiles'][number];

export const AttestationStatusSchema = z.enum(['met', 'not_met', 'not_applicable', 'unknown']);
export type AttestationStatus = z.infer<typeof AttestationStatusSchema>;

export const AttestationSchema = z.object({
  status: AttestationStatusSchema,
  evidence: z.string().min(1),
  owner: z.string().min(1),
  reviewed_at: z.string().date(),
  expires_at: z.string().date(),
});

const LegacyAttestationSchema = AttestationSchema.extend({
  expires_at: z.string().date().nullable().default(null),
});

export const AttestationFileSchema = z.object({
  benchmark_version: z.string().min(1),
  attestations: z.record(z.string(), AttestationSchema).default({}),
});

export const LegacyAttestationFileSchema = z.object({
  benchmark_version: z.string().min(1),
  attestations: z.record(z.string(), LegacyAttestationSchema).default({}),
});

export type Attestation =
  z.infer<typeof AttestationSchema> | z.infer<typeof LegacyAttestationSchema>;
export interface AttestationFile {
  benchmark_version: string;
  attestations: Record<string, Attestation>;
}

export const AgentEvidenceClaimSchema = z
  .object({
    status: z.enum(['met', 'not_met', 'unknown']),
    scope: z.enum(['platform', 'organization', 'outcome']),
    summary: z.string().min(1),
    references: z.array(z.string().min(1)).min(1),
    collected_at: z.string().datetime(),
    expires_at: z.string().datetime(),
    error: z.string().min(1).nullable().default(null),
  })
  .strict()
  .superRefine((claim, context) => {
    if (claim.error && claim.status !== 'unknown') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A claim with an error must have unknown status',
        path: ['status'],
      });
    }
  });

export const AgentEvidenceFileSchema = z
  .object({
    schema_version: z.literal('0.2.0'),
    benchmark_version: z.literal('0.2.0'),
    target: z
      .object({
        repository: z.string().min(1),
        git_head: z.string().min(1).nullable(),
      })
      .strict(),
    collector: z
      .object({
        name: z.string().min(1),
        version: z.string().min(1),
      })
      .strict(),
    claims: z.record(z.string().regex(/^ADRB-[A-Z]{3}-\d{3}$/), AgentEvidenceClaimSchema),
  })
  .strict();

export const AgentEvidenceClaimV03Schema = z
  .object({
    status: z.enum(['met', 'not_met', 'unknown']),
    scope: EvidenceScopeSchema,
    summary: z.string().min(1),
    references: z.array(z.string().min(1)).min(1),
    collected_at: z.string().datetime(),
    expires_at: z.string().datetime(),
    error: z.string().min(1).nullable().default(null),
  })
  .strict()
  .superRefine((claim, context) => {
    if (claim.error && claim.status !== 'unknown') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A claim with an error must have unknown status',
        path: ['status'],
      });
    }
    if (
      claim.scope === 'repository' &&
      claim.references.some((reference) => !reference.startsWith('repo:'))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Repository claims must use repo:<tracked-path>[#Lx-Ly] references',
        path: ['references'],
      });
    }
  });

function modernAgentEvidenceFileSchema<const Version extends '0.3.0' | '0.4.0'>(version: Version) {
  return z
    .object({
      schema_version: z.literal(version),
      benchmark_version: z.literal(version),
      target: z
        .object({
          repository: z.string().min(1),
          git_head: z.string().min(1),
        })
        .strict(),
      collector: z
        .object({
          name: z.string().min(1),
          version: z.string().min(1),
        })
        .strict(),
      claims: z.record(z.string().regex(/^ADRB-[A-Z]{3}-\d{3}$/), AgentEvidenceClaimV03Schema),
    })
    .strict();
}

export const AgentEvidenceFileV03Schema = modernAgentEvidenceFileSchema('0.3.0');

export const AgentEvidenceFileV04Schema = modernAgentEvidenceFileSchema('0.4.0');

export type AgentEvidenceClaim =
  z.infer<typeof AgentEvidenceClaimSchema> | z.infer<typeof AgentEvidenceClaimV03Schema>;
export type AgentEvidenceFile =
  | z.infer<typeof AgentEvidenceFileSchema>
  | z.infer<typeof AgentEvidenceFileV03Schema>
  | z.infer<typeof AgentEvidenceFileV04Schema>;

export type CheckStatus = 'met' | 'not_met' | 'unknown';
export type ControlStatus = CheckStatus | 'not_applicable';
export type EvidenceConfidence = 'repository-detected' | 'agent-collected' | 'attested' | 'none';

export interface EvidenceResult {
  type: EvidenceCheck['type'];
  scope: EvidenceScope;
  status: CheckStatus;
  summary: string;
  references: string[];
}

export interface ControlResult {
  id: string;
  dimension: DimensionId;
  level: 1 | 2 | 3 | 4;
  title: string;
  outcome: string;
  risk: string;
  status: ControlStatus;
  confidence: EvidenceConfidence;
  evidence_mode?: 'any';
  evidence: EvidenceResult[];
  agent_evidence: AgentEvidenceClaim | null;
  attestation: Attestation | null;
  remediation: string;
}

export interface DimensionResult {
  id: DimensionId;
  title: string;
  score: Level;
  controls_met: number;
  controls_total: number;
}

export interface ProfileResult {
  id: string;
  title: string;
  passed: boolean;
  blockers: Array<{
    dimension: DimensionId;
    actual: Level;
    required: Level;
    control_ids: string[];
  }>;
  evidence_dependencies?: {
    agent_collected: number;
    attested: number;
  };
}

export interface AssessmentReport {
  schema_version: '0.2.0' | '0.3.0' | '0.4.0';
  benchmark: { id: string; version: string };
  target: {
    repository: string;
    profile: string;
    scope: AssessmentScope;
    git_head: string | null;
    git_remote: string | null;
    working_tree_dirty: boolean | null;
  };
  assessed_at: string;
  warnings?: string[];
  score: {
    total: number;
    maximum: 40;
    percentage: number;
    repository?: {
      achieved: number;
      ceiling: number;
      percentage: number;
    };
  };
  evidence_summary: {
    repository_detected: number;
    agent_collected: number;
    attested: number;
    unmet: number;
    unknown: number;
    resolved?: number;
    total?: number;
  };
  dimensions: DimensionResult[];
  controls: ControlResult[];
  profiles: ProfileResult[];
  readiness: { highest_profile: string | null; target_passed: boolean };
  limitations: string[];
}
