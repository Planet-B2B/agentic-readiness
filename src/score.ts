import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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

function repositoryScore(
  catalog: Control[],
  results: ControlResult[],
  dimensions: Benchmark['dimensions'],
): { achieved: number; ceiling: number; percentage: number } {
  let achieved = 0;
  let ceiling = 0;
  const resultsById = new Map(results.map((result) => [result.id, result]));

  for (const { id: dimension } of dimensions) {
    let dimensionAchieved: Level = 0;
    let dimensionCeiling: Level = 0;
    let achievedOpen = true;
    let ceilingOpen = true;

    for (const level of [1, 2, 3, 4] as const) {
      const controlsAtLevel = catalog.filter(
        (control) => control.dimension === dimension && control.level === level,
      );
      const repositoryDetectable = controlsAtLevel.every((control) =>
        control.evidence.every((evidence) => evidence.scope === 'repository'),
      );
      if (ceilingOpen && repositoryDetectable) {
        dimensionCeiling = level;
      } else {
        ceilingOpen = false;
      }

      const repositoryEstablished = controlsAtLevel.every((control) => {
        const result = resultsById.get(control.id);
        return result?.status === 'met' && result.confidence === 'repository-detected';
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
    percentage: ceiling === 0 ? 0 : Math.round((achieved / ceiling) * 100),
  };
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
    const requiredControls = controls.filter(
      (control) => control.level <= profile.floors[control.dimension] && controlPasses(control),
    );
    return {
      id: profile.id,
      title: profile.title,
      passed: blockers.length === 0,
      blockers,
      ...(benchmark.version === '0.3.0'
        ? {
            evidence_dependencies: {
              agent_collected: requiredControls.filter(
                ({ confidence }) => confidence === 'agent-collected',
              ).length,
              attested: requiredControls.filter(({ confidence }) => confidence === 'attested')
                .length,
            },
          }
        : {}),
    };
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
    warnings?: string[];
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
  await validateAgentEvidence(benchmark, catalog, context, options.agentEvidence ?? null, now);

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
  const warnings = [...(options.warnings ?? [])];
  if (benchmark.version === '0.3.0') {
    if (scope === 'tracked' && context.metadata.tracked_tree_dirty) {
      warnings.push(
        'Tracked assessment includes uncommitted tracked-file contents, so the result is not reproducible from git_head alone. Use a clean worktree before comparing scores or collecting agent evidence.',
      );
    }
    const hasActiveSupplementalEvidence = controls.some(
      ({ agent_evidence: agentEvidence, attestation }) =>
        agentEvidence !== null || attestation !== null,
    );
    const unresolvedExternalOrOutcome = controls.some(
      ({ evidence, status }) =>
        (status === 'unknown' || status === 'not_met') &&
        evidence.some(({ scope: evidenceScope }) =>
          ['platform', 'organization', 'outcome'].includes(evidenceScope),
        ),
    );
    if (!hasActiveSupplementalEvidence && unresolvedExternalOrOutcome) {
      warnings.push(
        'Repository-only baseline: no active agent-collected or human-attested evidence was supplied. Platform, organization, and outcome evidence remains unresolved until authorized evidence is collected with init-evidence or supplied by accountable owners.',
      );
    }
  }
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
  const repository =
    benchmark.version === '0.3.0'
      ? repositoryScore(catalog, controls, benchmark.dimensions)
      : undefined;
  const highestProfile = [...profiles].reverse().find(({ passed }) => passed)?.id ?? null;
  const targetPassed = profiles.find(({ id }) => id === profileId)?.passed ?? false;

  return {
    schema_version: benchmark.version === '0.3.0' ? '0.3.0' : '0.2.0',
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
    ...(benchmark.version === '0.3.0' ? { warnings } : {}),
    score: {
      total,
      maximum: 40,
      percentage: Math.round((total / 40) * 100),
      ...(repository ? { repository } : {}),
    },
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
      ...(benchmark.version === '0.3.0'
        ? {
            resolved: controls.filter(({ status }) => status !== 'unknown').length,
            total: controls.length,
          }
        : {}),
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
      ...(benchmark.version === '0.3.0'
        ? [
            'Repository-detected progress uses only deterministic offline evidence and its attainable ceiling; it is explanatory and does not replace the normative score or readiness floors.',
            'Agent-collected repository evidence is semantic, target-bound, and source-backed but is not independently verified or relabelled as repository-detected.',
          ]
        : []),
      'Agent-collected evidence and human attestations are reported separately and are not independently verified.',
      'This assessment does not grant production access, deployment authority, or certification.',
    ],
  };
}

async function validateAgentEvidence(
  benchmark: Benchmark,
  catalog: Control[],
  context: RepositoryContext,
  evidence: AgentEvidenceFile | null,
  now: Date,
): Promise<void> {
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
  if (evidence.target.git_head !== expectedTarget.git_head) {
    throw new Error(
      `Agent evidence commit ${evidence.target.git_head ?? 'unavailable'} does not match ${expectedTarget.git_head ?? 'an unavailable Git commit'}`,
    );
  }
  if (benchmark.version === '0.3.0' && context.metadata.tracked_tree_dirty) {
    throw new Error('ADRB v0.3 agent evidence requires tracked files to match the bound commit');
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
    const manualScopes = control.evidence
      .filter(({ type }) => type === 'manual')
      .map(({ scope: evidenceScope }) => evidenceScope);
    const allowedScopes =
      control.agent_evidence_scopes.length > 0 ? control.agent_evidence_scopes : manualScopes;
    if (!allowedScopes.includes(claim.scope)) {
      throw new Error(`${controlId} does not accept ${claim.scope} evidence`);
    }
    if (claim.scope === 'repository') {
      if (context.includedPaths === null) {
        throw new Error(
          `${controlId} uses repository-scoped agent evidence, which requires --scope tracked`,
        );
      }
      for (const reference of claim.references) {
        const parsedReference = repositoryReference(reference);
        if (
          !parsedReference ||
          !context.includedPaths.has(parsedReference.path) ||
          context.excludedPaths.has(parsedReference.path)
        ) {
          throw new Error(`${controlId} references an unavailable tracked path: ${reference}`);
        }
        if (parsedReference.lines) {
          const contents = await readFile(
            join(context.metadata.root, parsedReference.path),
            'utf8',
          );
          const lineCount = countLines(contents);
          if (
            parsedReference.lines.start < 1 ||
            parsedReference.lines.end < parsedReference.lines.start
          ) {
            throw new Error(`${controlId} references an invalid line range: ${reference}`);
          }
          if (parsedReference.lines.end > lineCount) {
            throw new Error(
              `${controlId} references lines beyond ${parsedReference.path}'s ${lineCount} lines: ${reference}`,
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
    if (
      claim.summary.startsWith('TODO') ||
      claim.references.some((reference) => reference.startsWith('TODO'))
    ) {
      throw new Error(`${controlId} contains unresolved TODO evidence`);
    }
  }
}

function repositoryReference(reference: string): {
  path: string;
  lines: { start: number; end: number } | null;
} | null {
  if (!reference.startsWith('repo:')) return null;
  const withoutPrefix = reference.slice('repo:'.length);
  const lineMatch = withoutPrefix.match(/#L(\d+)(?:-L?(\d+))?$/);
  const path = lineMatch ? withoutPrefix.slice(0, lineMatch.index) : withoutPrefix;
  if (
    path.length === 0 ||
    path.startsWith('/') ||
    path.includes('#') ||
    path.includes('\\') ||
    path.split('/').some((part) => part === '..' || part === '.')
  ) {
    return null;
  }
  const start = lineMatch ? Number(lineMatch[1]) : null;
  const end = lineMatch ? Number(lineMatch[2] ?? lineMatch[1]) : null;
  return {
    path,
    lines: start === null || end === null ? null : { start, end },
  };
}

function countLines(contents: string): number {
  if (contents.length === 0) return 0;
  const lines = contents.split('\n').length;
  return contents.endsWith('\n') ? lines - 1 : lines;
}
