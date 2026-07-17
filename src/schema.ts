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

const PathAnySchema = z.object({
  type: z.literal('path_any'),
  patterns: z.array(z.string().min(1)).min(1),
});

const PathAllSchema = z.object({
  type: z.literal('path_all'),
  patterns: z.array(z.string().min(1)).min(1),
});

const ContentAnySchema = z.object({
  type: z.literal('content_any'),
  files: z.array(z.string().min(1)).min(1),
  needles: z.array(z.string().min(1)).min(1),
});

const ContentAllSchema = z.object({
  type: z.literal('content_all'),
  files: z.array(z.string().min(1)).min(1),
  needles: z.array(z.string().min(1)).min(1),
});

const MaxBytesSchema = z.object({
  type: z.literal('max_bytes'),
  patterns: z.array(z.string().min(1)).min(1),
  max_bytes: z.number().int().positive(),
});

const ManualSchema = z.object({
  type: z.literal('manual'),
  prompt: z.string().min(1),
});

export const EvidenceCheckSchema = z.discriminatedUnion('type', [
  PathAnySchema,
  PathAllSchema,
  ContentAnySchema,
  ContentAllSchema,
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
  remediation: z.string().min(1),
  references: z.array(z.string().min(1)).default([]),
  allow_attestation: z.boolean().default(true),
  allow_not_applicable: z.boolean().default(false),
});

export const ControlFileSchema = z.object({
  dimension: DimensionIdSchema,
  controls: z.array(RawControlSchema).min(1),
});

export type Control = z.infer<typeof RawControlSchema> & { dimension: DimensionId };

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
  expires_at: z.string().date().nullable().default(null),
});

export const AttestationFileSchema = z.object({
  benchmark_version: z.string().min(1),
  attestations: z.record(z.string(), AttestationSchema).default({}),
});

export type Attestation = z.infer<typeof AttestationSchema>;
export type AttestationFile = z.infer<typeof AttestationFileSchema>;

export type CheckStatus = 'met' | 'not_met' | 'unknown';
export type ControlStatus = CheckStatus | 'not_applicable';
export type EvidenceConfidence = 'verified' | 'attested' | 'none';

export interface EvidenceResult {
  type: EvidenceCheck['type'];
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
  evidence: EvidenceResult[];
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
}

export interface AssessmentReport {
  schema_version: '0.1.0';
  benchmark: { id: string; version: string };
  target: { repository: string; profile: string };
  assessed_at: string;
  score: { total: number; maximum: 40; percentage: number };
  evidence_summary: { verified: number; attested: number; unmet_or_unknown: number };
  dimensions: DimensionResult[];
  controls: ControlResult[];
  profiles: ProfileResult[];
  readiness: { highest_profile: string | null; target_passed: boolean };
  limitations: string[];
}
