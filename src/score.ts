import type {
  AssessmentReport,
  AttestationFile,
  Benchmark,
  Control,
  ControlResult,
  DimensionId,
  DimensionResult,
  Level,
  ProfileResult,
} from './schema.js';
import { evaluateControl } from './evidence.js';

function controlPasses(control: ControlResult): boolean {
  return control.status === 'met' || control.status === 'not_applicable';
}

function dimensionScore(controls: ControlResult[], dimension: DimensionId): Level {
  let score: Level = 0;
  for (const level of [1, 2, 3, 4] as const) {
    const atLevel = controls.filter(
      (control) => control.dimension === dimension && control.level === level,
    );
    if (atLevel.length === 0 || !atLevel.every(controlPasses)) break;
    score = level;
  }
  return score;
}

function assessProfiles(
  benchmark: Benchmark,
  dimensions: DimensionResult[],
  controls: ControlResult[],
): ProfileResult[] {
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
          control_ids: controls
            .filter(
              (control) =>
                control.dimension === id && control.level <= required && !controlPasses(control),
            )
            .map(({ id: controlId }) => controlId),
        },
      ];
    });
    return { id: profile.id, title: profile.title, passed: blockers.length === 0, blockers };
  });
}

export async function assess(
  repo: string,
  benchmark: Benchmark,
  catalog: Control[],
  profileId: string,
  attestations: AttestationFile | null,
  now = new Date(),
): Promise<AssessmentReport> {
  const profile = benchmark.readiness_profiles.find(({ id }) => id === profileId);
  if (!profile) {
    throw new Error(
      `Unknown profile ${profileId}. Choose: ${benchmark.readiness_profiles.map(({ id }) => id).join(', ')}`,
    );
  }

  const controls = await Promise.all(
    catalog.map(async (control) => evaluateControl(repo, control, attestations, now)),
  );
  const dimensions: DimensionResult[] = benchmark.dimensions.map(({ id, title }) => {
    const dimensionControls = controls.filter((control) => control.dimension === id);
    return {
      id,
      title,
      score: dimensionScore(controls, id),
      controls_met: dimensionControls.filter(controlPasses).length,
      controls_total: dimensionControls.length,
    };
  });
  const profiles = assessProfiles(benchmark, dimensions, controls);
  const total = dimensions.reduce((sum, { score }) => sum + score, 0);
  const highestProfile = [...profiles].reverse().find(({ passed }) => passed)?.id ?? null;
  const targetPassed = profiles.find(({ id }) => id === profileId)?.passed ?? false;

  return {
    schema_version: '0.1.0',
    benchmark: { id: benchmark.id, version: benchmark.version },
    target: { repository: repo, profile: profileId },
    assessed_at: now.toISOString(),
    score: { total, maximum: 40, percentage: Math.round((total / 40) * 100) },
    evidence_summary: {
      verified: controls.filter(
        ({ confidence, status }) => confidence === 'verified' && status === 'met',
      ).length,
      attested: controls.filter(
        ({ confidence, status }) => confidence === 'attested' && status === 'met',
      ).length,
      unmet_or_unknown: controls.filter(
        ({ status }) => status === 'not_met' || status === 'unknown',
      ).length,
    },
    dimensions,
    controls,
    profiles,
    readiness: { highest_profile: highestProfile, target_passed: targetPassed },
    limitations: [
      'Repository evidence proves that an artifact exists, not that people consistently follow it.',
      'Self-attestations are reported separately and are not tool-verified evidence.',
      'This assessment does not grant production access, deployment authority, or certification.',
    ],
  };
}
