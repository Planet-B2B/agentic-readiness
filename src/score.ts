import type {
  AssessmentReport,
  AgentEvidenceFile,
  AssessmentScope,
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
import {
  createRepositoryContext,
  repositoryEvidenceTarget,
  type RepositoryContext,
} from './repository.js';

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
  options: {
    scope?: AssessmentScope;
    attestations?: AttestationFile | null;
    agentEvidence?: AgentEvidenceFile | null;
    now?: Date;
    excludedPaths?: string[];
  } = {},
): Promise<AssessmentReport> {
  const profile = benchmark.readiness_profiles.find(({ id }) => id === profileId);
  if (!profile) {
    throw new Error(
      `Unknown profile ${profileId}. Choose: ${benchmark.readiness_profiles.map(({ id }) => id).join(', ')}`,
    );
  }

  const scope = options.scope ?? 'tracked';
  const now = options.now ?? new Date();
  const context = await createRepositoryContext(repo, scope, options.excludedPaths);
  validateAgentEvidence(benchmark, catalog, context, options.agentEvidence ?? null, now);

  const controls = await Promise.all(
    catalog.map(async (control) =>
      evaluateControl(
        context,
        control,
        options.attestations ?? null,
        options.agentEvidence?.claims[control.id] ?? null,
        now,
      ),
    ),
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
    schema_version: '0.2.0',
    benchmark: { id: benchmark.id, version: benchmark.version },
    target: {
      repository: repo,
      profile: profileId,
      scope,
      git_head: context.metadata.git_head,
      git_remote: context.metadata.git_remote,
      working_tree_dirty: context.metadata.working_tree_dirty,
    },
    assessed_at: now.toISOString(),
    score: { total, maximum: 40, percentage: Math.round((total / 40) * 100) },
    evidence_summary: {
      repository_detected: controls.filter(
        ({ confidence, status }) => confidence === 'repository-detected' && status === 'met',
      ).length,
      agent_collected: controls.filter(
        ({ confidence, status }) => confidence === 'agent-collected' && status === 'met',
      ).length,
      attested: controls.filter(
        ({ confidence, status }) => confidence === 'attested' && status === 'met',
      ).length,
      unmet: controls.filter(({ status }) => status === 'not_met').length,
      unknown: controls.filter(({ status }) => status === 'unknown').length,
    },
    dimensions,
    controls,
    profiles,
    readiness: { highest_profile: highestProfile, target_passed: targetPassed },
    limitations: [
      scope === 'tracked'
        ? 'Tracked mode considers only Git-tracked paths, using current working-tree contents; uncommitted edits to tracked files can affect the result.'
        : 'Workspace mode includes untracked local files and is provisional; do not compare it directly with tracked-mode reports.',
      'Repository-detected evidence proves a qualifying artifact match, not consistent practice or external enforcement.',
      'Agent-collected evidence and human attestations are reported separately and are not independently verified.',
      'This assessment does not grant production access, deployment authority, or certification.',
    ],
  };
}

function validateAgentEvidence(
  benchmark: Benchmark,
  catalog: Control[],
  context: RepositoryContext,
  evidence: AgentEvidenceFile | null,
  now: Date,
): void {
  if (!evidence) return;
  if (evidence.benchmark_version !== benchmark.version) {
    throw new Error(
      `Agent evidence benchmark ${evidence.benchmark_version} does not match ${benchmark.version}`,
    );
  }
  const expectedTarget = repositoryEvidenceTarget(context.metadata);
  if (evidence.target.repository !== expectedTarget.repository) {
    throw new Error(
      `Agent evidence target ${evidence.target.repository} does not match ${expectedTarget.repository}`,
    );
  }
  if (evidence.target.git_head && evidence.target.git_head !== expectedTarget.git_head) {
    throw new Error(
      `Agent evidence commit ${evidence.target.git_head} does not match ${expectedTarget.git_head ?? 'an unavailable Git commit'}`,
    );
  }

  const controls = new Map(catalog.map((control) => [control.id, control]));
  if (
    Object.keys(evidence.claims).length > 0 &&
    (evidence.collector.name.startsWith('TODO') || evidence.collector.version.startsWith('TODO'))
  ) {
    throw new Error('Agent evidence with claims must identify the collector name and version');
  }
  for (const [controlId, claim] of Object.entries(evidence.claims)) {
    const control = controls.get(controlId);
    if (!control) throw new Error(`Agent evidence references unknown control ${controlId}`);
    if (!control.allow_agent_evidence) {
      throw new Error(`${controlId} does not permit agent-collected evidence`);
    }
    const allowedScopes = control.evidence
      .filter(({ type }) => type === 'manual')
      .map(({ scope: evidenceScope }) => evidenceScope);
    if (!allowedScopes.includes(claim.scope)) {
      throw new Error(`${controlId} does not accept ${claim.scope} evidence`);
    }
    if (new Date(claim.collected_at) > new Date(claim.expires_at)) {
      throw new Error(`${controlId} expires before it was collected`);
    }
    if (new Date(claim.collected_at) > now) {
      throw new Error(`${controlId} has a future collection timestamp`);
    }
    if (
      claim.summary.startsWith('TODO') ||
      claim.references.some((reference) => reference.startsWith('TODO'))
    ) {
      throw new Error(`${controlId} contains unresolved TODO evidence`);
    }
  }
}
