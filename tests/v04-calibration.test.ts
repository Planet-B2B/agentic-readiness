import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { loadAttestations, loadBenchmark } from '../src/load.js';
import { toMarkdown } from '../src/report.js';
import { assess } from '../src/score.js';
import type { AgentEvidenceFile } from '../src/schema.js';

const v04Root = resolve(import.meta.dirname, '..', 'benchmark', 'v0.4');

async function gitFixture(files: Record<string, string>): Promise<string> {
  const repository = await mkdtemp(join(tmpdir(), 'adrb-v04-'));
  execFileSync('git', ['-C', repository, 'init', '--quiet']);
  execFileSync('git', [
    '-C',
    repository,
    'remote',
    'add',
    'origin',
    'https://example.invalid/acme/repository.git',
  ]);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(repository, path)), { recursive: true });
    await writeFile(join(repository, path), contents, 'utf8');
  }
  execFileSync('git', ['-C', repository, 'add', '.']);
  execFileSync('git', [
    '-C',
    repository,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  ]);
  return repository;
}

function controlStatus(report: Awaited<ReturnType<typeof assess>>, id: string) {
  return report.controls.find((control) => control.id === id);
}

describe('v0.4 evidence calibration', () => {
  it('retains the mature level-three conformance result', async () => {
    const repository = resolve(import.meta.dirname, 'fixtures', 'mature');
    const { benchmark, controls } = await loadBenchmark(v04Root);
    const attestations = await loadAttestations(
      join(repository, '.agentic', 'attestations-v0.4.yaml'),
      benchmark.version,
    );
    const report = await assess(repository, benchmark, controls, 'limited-autonomous-maintenance', {
      attestations,
      now: new Date('2026-07-18T12:00:00.000Z'),
    });

    expect(report.score.total).toBe(30);
    expect(report.score.repository).toEqual({ achieved: 23, ceiling: 23, percentage: 100 });
    expect(report.controls).toHaveLength(45);
    expect(report.evidence_summary.attested).toBe(8);
    expect(report.readiness.target_passed).toBe(true);
    expect(report.readiness.highest_profile).toBe('limited-autonomous-maintenance');
  });

  it('reports semantic containment coverage without promoting a partial match', async () => {
    const repository = await gitFixture({
      'AGENTS.md': [
        '# Agent boundaries',
        'Edit only allowed paths. If requested work leaves those paths, stop and ask the coordinator.',
        'A human approval is required before work can continue.',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const resilience = controlStatus(report, 'ADRB-RES-002');

      expect(resilience?.status).toBe('not_met');
      expect(resilience?.evidence[0]?.summary).toContain('semantic coverage 3/5');
      expect(resilience?.evidence[0]?.summary).toContain(
        'matched: mutation-scope, stop-trigger, escalation',
      );
      expect(resilience?.evidence[0]?.summary).toContain(
        'missing: resource-or-retry-bounds, recovery-ownership',
      );
      expect(resilience?.evidence[0]?.references).toContain('AGENTS.md');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('accepts complete containment guidance without requiring v0.3 idioms', async () => {
    const repository = await gitFixture({
      'AGENTS.md': [
        '# Agent boundaries',
        'Edit only allowed paths and respect the task time and tool-call budget.',
        'If the request crosses that boundary, halt work and escalate to the coordinator.',
        'The rollback owner is accountable for restoring affected state.',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const resilience = controlStatus(report, 'ADRB-RES-002');

      expect(resilience?.status).toBe('met');
      expect(resilience?.confidence).toBe('repository-detected');
      expect(resilience?.evidence[0]?.summary).toContain('semantic coverage 5/5');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('distinguishes partial evidence checks from control confidence', async () => {
    const repository = await gitFixture({
      'CONTRIBUTING.md': [
        '# Review governance',
        'The repository owner assigns a reviewer. Human approval is required.',
        'Only a maintainer has merge authority after the required review.',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const governance = controlStatus(report, 'ADRB-GOV-002');
      const markdown = toMarkdown(report);

      expect(governance?.status).toBe('not_met');
      expect(governance?.confidence).toBe('none');
      expect(governance?.evidence.map(({ status }) => status)).toEqual(['not_met', 'met']);
      expect(markdown).toContain('Required evidence checks established: 1/2.');
      expect(markdown).toContain('Blocking checks: `#1 repository/ownership_map`.');
      expect(markdown).toContain(
        'Control confidence: none — all required evidence checks must pass.',
      );
      expect(markdown).not.toContain('Evidence confidence: none.');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('numbers repeated evidence types so blockers remain unambiguous', async () => {
    const repository = await gitFixture({ 'README.md': '# Fixture repository\n' });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const environment = controlStatus(report, 'ADRB-ENV-002');
      const markdown = toMarkdown(report);

      expect(environment?.evidence.map(({ type }) => type)).toEqual(['path_any', 'path_any']);
      expect(markdown).toContain(
        'Blocking checks: `#1 repository/path_any`, `#2 repository/path_any`.',
      );
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('accepts explicit ownership maps without requiring CODEOWNERS', async () => {
    const repository = await gitFixture({
      'CONTRIBUTING.md': [
        '# Review governance',
        'The required reviewer provides approval.',
        'Only maintainers have merge authority.',
      ].join('\n'),
      'docs/governance/ownership.md': [
        '# Component ownership',
        '| Component | Reviewer team |',
        '| --- | --- |',
        '| packages/platform/** | @platform-team |',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const governance = controlStatus(report, 'ADRB-GOV-002');

      expect(governance?.status).toBe('met');
      expect(governance?.confidence).toBe('repository-detected');
      expect(governance?.evidence[0]?.type).toBe('ownership_map');
      expect(governance?.evidence[0]?.references).toContain('docs/governance/ownership.md');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('accepts a conventional repo-wide maintainer declaration', async () => {
    const repository = await gitFixture({
      'CONTRIBUTING.md': [
        '# Review governance',
        'The required reviewer provides approval and maintainers retain merge authority.',
      ].join('\n'),
      'MAINTAINERS.md': '# Repository maintainers\n\n- @release-maintainer\n',
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const governance = controlStatus(report, 'ADRB-GOV-002');

      expect(governance?.status).toBe('met');
      expect(governance?.evidence[0]?.references).toContain('MAINTAINERS.md');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('accepts a conventional OWNERS.md contact list', async () => {
    const repository = await gitFixture({
      'CONTRIBUTING.md': [
        '# Review governance',
        'The required reviewer provides human approval and maintainers retain merge authority.',
      ].join('\n'),
      'OWNERS.md': '# Repository owners\n\n- @platform-team\n',
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const governance = controlStatus(report, 'ADRB-GOV-002');

      expect(governance?.status).toBe('met');
      expect(governance?.evidence[0]?.references).toContain('OWNERS.md');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('rejects placeholder table owners and descriptive maintainer prose', async () => {
    const repository = await gitFixture({
      'CONTRIBUTING.md': 'Human approval is required and maintainers retain merge authority.\n',
      'docs/governance/ownership.md': [
        '# Component ownership',
        '| Component | Owner |',
        '| --- | --- |',
        '| packages/platform/** | TBD |',
        '| TBD | @platform-team |',
        '| - | @release-team |',
        '| component TBD | @component-team |',
        '| path / | @path-team |',
        '| / | @root-team |',
        '| * | @wildcard-team |',
        '| /** | @recursive-team |',
        '| packages/security/** | No owner; contact @security for help |',
        'packages/**: no owner',
        'packages/legacy/**: Former maintainer: @old-team (inactive)',
      ].join('\n'),
      'MAINTAINERS.md': [
        '# Maintainers',
        '',
        '- Security team handbook',
        '- Former maintainer: @old-team (inactive)',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const governance = controlStatus(report, 'ADRB-GOV-002');

      expect(governance?.status).toBe('not_met');
      expect(governance?.evidence[0]?.status).toBe('not_met');
      expect(governance?.evidence[0]?.references).toEqual([]);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it.each([
    {
      name: 'requires authority guidance in addition to an ownership map',
      guidance: 'Repository owners select reviewers for each change.\n',
    },
    {
      name: 'does not infer positive authority from a statement denying agent authority',
      guidance: [
        'Repository owners select reviewers for each change.',
        'Green CI is not merge authority, and agents cannot approve changes.',
      ].join('\n'),
    },
    {
      name: 'does not accept agent approval and merge authority as retained human governance',
      guidance: 'Agents may approve and agents may merge changes automatically.\n',
    },
    {
      name: 'does not infer human authority from explicitly negated statements',
      guidance: 'No designated human may approve changes. No designated human may merge changes.\n',
    },
    {
      name: 'does not infer authority from negation after the matched term',
      guidance: 'Reviewer approval is not required. Human merge authority is prohibited.\n',
    },
  ])('$name', async ({ guidance }) => {
    const repository = await gitFixture({
      'CONTRIBUTING.md': guidance,
      'OWNERS.md': '- @platform-team\n',
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const governance = controlStatus(report, 'ADRB-GOV-002');
      expect(governance?.status).toBe('not_met');
      expect(governance?.evidence.map(({ status }) => status)).toEqual(['met', 'not_met']);
      expect(governance?.evidence[1]?.summary).toContain('semantic coverage 0/2');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('does not treat vague ownership prose as an ownership assignment', async () => {
    const repository = await gitFixture({
      'GOVERNANCE.md': [
        '# Governance',
        'Owners and reviewers collaborate on approval before a maintainer may merge.',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const governance = controlStatus(report, 'ADRB-GOV-002');

      expect(governance?.status).toBe('not_met');
      expect(governance?.evidence[0]?.status).toBe('not_met');
      expect(governance?.evidence[1]?.status).toBe('not_met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('does not treat hyphenated collaboration prose as an ownership target', async () => {
    const repository = await gitFixture({
      'CONTRIBUTING.md': 'The required reviewer provides approval and maintainers may merge.\n',
      'GOVERNANCE.md': 'Cross-team collaboration: @platform-team\n',
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const governance = controlStatus(report, 'ADRB-GOV-002');
      expect(governance?.status).toBe('not_met');
      expect(governance?.evidence.map(({ status }) => status)).toEqual(['not_met', 'met']);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('requires executed secret scanning separately from untrusted-input safeguards', async () => {
    const keywordOnly = await gitFixture({
      '.github/workflows/security.yml': [
        'name: Security',
        '# gitleaks secret scan is planned',
        'jobs:',
        '  test:',
        '    steps:',
        '      - run: npm test',
      ].join('\n'),
    });
    const executed = await gitFixture({
      '.github/workflows/security.yml': [
        'name: Security',
        'on:',
        '  pull_request:',
        '    types: [opened, reopened, synchronize]',
        'jobs:',
        '  scan:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: gitleaks/gitleaks-action@v2',
      ].join('\n'),
    });
    const nonEnforced = await gitFixture({
      '.github/workflows/echo.yml': [
        'name: Echo only',
        'on: [pull_request]',
        'jobs:',
        '  scan:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo gitleaks',
      ].join('\n'),
      '.github/workflows/disabled.yml': [
        'name: Disabled scan',
        'on: [pull_request]',
        'jobs:',
        '  scan:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - if: false',
        '        run: gitleaks detect',
      ].join('\n'),
      '.github/workflows/manual.yml': [
        'name: Manual scan',
        'on: [workflow_dispatch]',
        'jobs:',
        '  scan:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: gitleaks detect',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const keywordReport = await assess(keywordOnly, benchmark, controls, 'pr-creation');
      const executedReport = await assess(executed, benchmark, controls, 'pr-creation');
      const nonEnforcedReport = await assess(nonEnforced, benchmark, controls, 'pr-creation');
      const keywordMarkdown = toMarkdown(keywordReport);

      expect(controlStatus(keywordReport, 'ADRB-SEC-003')?.status).toBe('unknown');
      expect(keywordMarkdown).toContain(
        'Alternative evidence checks established: 0/2; one required.',
      );
      expect(keywordMarkdown).toContain('## Alternative evidence paths not established');
      expect(keywordMarkdown).toContain(
        'Unresolved alternatives: `#1 repository/ci_command`, `#2 platform/manual`.',
      );
      expect(keywordMarkdown).toContain(
        'Control confidence: none — one evidence alternative must pass.',
      );
      expect(controlStatus(executedReport, 'ADRB-SEC-003')?.status).toBe('met');
      expect(controlStatus(executedReport, 'ADRB-SEC-003')?.evidence[0]?.type).toBe('ci_command');
      expect(controlStatus(nonEnforcedReport, 'ADRB-SEC-003')?.status).toBe('unknown');
      expect(controlStatus(nonEnforcedReport, 'ADRB-SEC-003')?.evidence[0]?.summary).toContain(
        '0 contributing CI configuration file(s) contain enabled integration-triggered recognized commands',
      );
      expect(controlStatus(executedReport, 'ADRB-SEC-007')?.status).toBe('unknown');
      expect(controlStatus(executedReport, 'ADRB-SEC-007')?.evidence[0]?.type).toBe('manual');
    } finally {
      await rm(keywordOnly, { recursive: true, force: true });
      await rm(executed, { recursive: true, force: true });
      await rm(nonEnforced, { recursive: true, force: true });
    }
  });

  it('accepts platform-native secret scanning without satisfying untrusted-input safeguards', async () => {
    const repository = await gitFixture({ 'README.md': '# Fixture repository' });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const gitHead = execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim();
      const evidence: AgentEvidenceFile = {
        schema_version: '0.4.0',
        benchmark_version: '0.4.0',
        target: {
          repository: 'https://example.invalid/acme/repository.git',
          git_head: gitHead,
        },
        collector: { name: 'fixture-platform-adapter', version: '1.0.0' },
        claims: {
          'ADRB-SEC-003': {
            status: 'met',
            scope: 'platform',
            summary: 'Host-native scanning and push protection cover the assessed repository.',
            references: ['https://example.invalid/settings/security/secret-scanning'],
            collected_at: '2026-07-18T10:00:00.000Z',
            expires_at: '2026-08-17T10:00:00.000Z',
            error: null,
          },
        },
      };
      const report = await assess(repository, benchmark, controls, 'pr-creation', {
        agentEvidence: evidence,
        now: new Date('2026-07-18T12:00:00.000Z'),
      });

      expect(controlStatus(report, 'ADRB-SEC-003')?.status).toBe('met');
      expect(controlStatus(report, 'ADRB-SEC-003')?.confidence).toBe('agent-collected');
      expect(controlStatus(report, 'ADRB-SEC-007')?.status).toBe('unknown');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('recognizes enabled merge-request scanners in GitLab and Azure pipelines', async () => {
    const gitlab = await gitFixture({
      '.gitlab-ci.yml': [
        'stages: [test]',
        'secret-scan:',
        '  stage: test',
        '  rules:',
        '    - if: $CI_PIPELINE_SOURCE == "merge_request_event"',
        '  script:',
        '    - gitleaks detect',
      ].join('\n'),
    });
    const azure = await gitFixture({
      'azure-pipelines.yml': [
        'pr:',
        '  branches:',
        '    include: ["*"]',
        'steps:',
        '  - script: gitleaks detect',
        "    condition: and(succeeded(), eq(variables['Build.Reason'], 'PullRequest'))",
      ].join('\n'),
      '.azure-pipelines/continue.yml': [
        'pr: [main]',
        'steps:',
        '  - script: gitleaks detect',
        '    continueOnError: true',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const gitlabReport = await assess(gitlab, benchmark, controls, 'pr-creation');
      const azureReport = await assess(azure, benchmark, controls, 'pr-creation');

      expect(controlStatus(gitlabReport, 'ADRB-SEC-003')?.status).toBe('met');
      expect(controlStatus(azureReport, 'ADRB-SEC-003')?.status).toBe('met');
    } finally {
      await rm(gitlab, { recursive: true, force: true });
      await rm(azure, { recursive: true, force: true });
    }
  });

  it('requires TruffleHog findings to fail the CI command', async () => {
    const blocking = await gitFixture({
      '.github/workflows/security.yml': [
        'on: [pull_request]',
        'jobs:',
        '  scan:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: trufflehog git --fail',
      ].join('\n'),
    });
    const advisory = await gitFixture({
      '.github/workflows/security.yml': [
        'on: [pull_request]',
        'jobs:',
        '  scan:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: trufflehog git',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const blockingReport = await assess(blocking, benchmark, controls, 'pr-creation');
      const advisoryReport = await assess(advisory, benchmark, controls, 'pr-creation');
      expect(controlStatus(blockingReport, 'ADRB-SEC-003')?.status).toBe('met');
      expect(controlStatus(advisoryReport, 'ADRB-SEC-003')?.status).toBe('unknown');
    } finally {
      await rm(blocking, { recursive: true, force: true });
      await rm(advisory, { recursive: true, force: true });
    }
  });

  it('requires approval and merge authority independently', async () => {
    const approvalOnly = await gitFixture({
      'CONTRIBUTING.md': 'The required reviewer provides approval.\n',
      'OWNERS.md': '- @platform-team\n',
    });
    const mergeOnly = await gitFixture({
      'CONTRIBUTING.md': 'Only maintainers may merge changes.\n',
      'OWNERS.md': '- @platform-team\n',
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      for (const repository of [approvalOnly, mergeOnly]) {
        const report = await assess(repository, benchmark, controls, 'pr-creation');
        const governance = controlStatus(report, 'ADRB-GOV-002');
        expect(governance?.status).toBe('not_met');
        expect(governance?.evidence[0]?.status).toBe('met');
        expect(governance?.evidence[1]?.status).toBe('not_met');
        expect(governance?.evidence[1]?.summary).toContain('semantic coverage 1/2');
      }
    } finally {
      await rm(approvalOnly, { recursive: true, force: true });
      await rm(mergeOnly, { recursive: true, force: true });
    }
  });

  it('does not treat a generic human merge gate as containment escalation', async () => {
    const repository = await gitFixture({
      'AGENTS.md': [
        'Edit only allowed paths within the stated token budget.',
        'If work leaves scope, stop safely. Human approval is required before merge.',
        'The rollback owner is responsible for recovery.',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const resilience = controlStatus(report, 'ADRB-RES-002');
      expect(resilience?.status).toBe('not_met');
      expect(resilience?.evidence[0]?.summary).toContain('missing: escalation');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('does not infer containment components from explicit absence language', async () => {
    const repository = await gitFixture({
      'AGENTS.md': [
        'The allowed path is not set and the write scope is unavailable.',
        'The budget is not set and the retry limit is prohibited.',
        'The stop condition is forbidden and escalation is not available.',
        'The recovery owner is not assigned.',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const resilience = controlStatus(report, 'ADRB-RES-002');
      expect(resilience?.status).toBe('not_met');
      expect(resilience?.evidence[0]?.summary).toContain('semantic coverage 0/5');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('requires executed CI commands for level-three guidance and verification controls', async () => {
    const commentsOnly = await gitFixture({
      Jenkinsfile: [
        '// validate AGENTS.md and agent instructions',
        '// test coverage, typecheck, and lint',
      ].join('\n'),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        '# validate AGENTS.md and agent instructions',
        '# test coverage, typecheck, and lint',
        'jobs:',
        '  noop:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo no-op',
        '      - run: pytest --collect-only',
        '      - run: mypy --help',
        '      - run: node agent-doc-check',
      ].join('\n'),
    });
    const executed = await gitFixture({
      'package.json': JSON.stringify({
        scripts: {
          'agent-doc-check': 'node scripts/check-agent-docs.js',
          test: 'vitest run',
          typecheck: 'tsc --noEmit',
        },
      }),
      'scripts/check-agent-docs.js': 'export const validatesAgentGuidance = true;\n',
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: npm run agent-doc-check',
        '      - run: npm test',
        '      - run: npm run typecheck',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const commentsReport = await assess(commentsOnly, benchmark, controls, 'pr-creation');
      const executedReport = await assess(executed, benchmark, controls, 'pr-creation');

      expect(controlStatus(commentsReport, 'ADRB-CTX-003')?.status).toBe('not_met');
      expect(controlStatus(commentsReport, 'ADRB-TST-003')?.status).toBe('not_met');
      expect(controlStatus(executedReport, 'ADRB-CTX-003')?.status).toBe('met');
      expect(controlStatus(executedReport, 'ADRB-TST-003')?.status).toBe('met');
    } finally {
      await rm(commentsOnly, { recursive: true, force: true });
      await rm(executed, { recursive: true, force: true });
    }
  });

  it('rejects package task names that are missing or bound only to display commands', async () => {
    const repository = await gitFixture({
      'package.json': JSON.stringify({
        scripts: {
          'agent-doc-check': 'node scripts/check-agent-docs.js',
          test: 'echo vitest run',
          typecheck: 'echo tsc --noEmit',
        },
      }),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: npm run agent-doc-check',
        '      - run: npm test',
        '      - run: npm run missing-typecheck',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-CTX-003')?.status).toBe('not_met');
      expect(controlStatus(report, 'ADRB-TST-003')?.status).toBe('not_met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('recognizes polyglot verification commands across GitLab and Azure', async () => {
    const gitlab = await gitFixture({
      '.gitlab-ci.yml': [
        'verify:',
        '  only: [merge_requests]',
        '  script:',
        '    - uv run pytest',
        '    - uv run mypy .',
      ].join('\n'),
    });
    const azure = await gitFixture({
      'azure-pipelines.yml': [
        'pr: [main]',
        'steps:',
        '  - script: cargo test',
        '  - script: cargo clippy',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      for (const repository of [gitlab, azure]) {
        const report = await assess(repository, benchmark, controls, 'pr-creation');
        expect(controlStatus(report, 'ADRB-TST-003')?.status).toBe('met');
      }
    } finally {
      await rm(gitlab, { recursive: true, force: true });
      await rm(azure, { recursive: true, force: true });
    }
  });

  it('aggregates required verification classes across separate CI files', async () => {
    const repository = await gitFixture({
      '.github/workflows/tests.yml': [
        'on: [pull_request]',
        'jobs:',
        '  tests:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: pytest',
      ].join('\n'),
      '.github/workflows/static-analysis.yml': [
        'on: [pull_request]',
        'jobs:',
        '  static-analysis:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: mypy .',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const testing = controlStatus(report, 'ADRB-TST-003');
      expect(testing?.status).toBe('met');
      expect(testing?.evidence[0]?.summary).toContain('aggregate command-class match 2/2');
      expect(testing?.evidence[0]?.references).toEqual([
        '.github/workflows/static-analysis.yml',
        '.github/workflows/tests.yml',
      ]);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('resolves recognized monorepo commands through tracked package tasks', async () => {
    const repository = await gitFixture({
      'package.json': JSON.stringify({
        scripts: {
          lint: 'turbo run lint',
          test: 'turbo run test',
        },
      }),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: npm test',
        '      - run: npm run lint',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-TST-003')?.status).toBe('met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('does not combine executable and argument aliases into nonexistent verification commands', async () => {
    const repository = await gitFixture({
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: go lint',
        '      - run: cargo typecheck',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const testing = controlStatus(report, 'ADRB-TST-003');
      expect(testing?.status).toBe('not_met');
      expect(testing?.evidence[0]?.summary).toContain('aggregate command-class match 0/2');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('ignores nested and unreferenced CI fragments', async () => {
    const repository = await gitFixture({
      '.github/workflows/fixtures/fake.yml': [
        'on: [pull_request]',
        'jobs:',
        '  fake:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: gitleaks detect',
      ].join('\n'),
      '.gitlab-ci/fragments/fake.yml': [
        'fake:',
        '  only: [merge_requests]',
        '  script: gitleaks detect',
      ].join('\n'),
      '.azure-pipelines/fake.yml': ['pr: [main]', 'steps:', '  - script: gitleaks detect'].join(
        '\n',
      ),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-SEC-003')?.status).toBe('unknown');
      expect(controlStatus(report, 'ADRB-SEC-003')?.evidence[0]?.references).toEqual([]);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('rejects command-shaped fields outside Azure step nodes', async () => {
    const repository = await gitFixture({
      'azure-pipelines.yml': ['pr: [main]', 'script: gitleaks detect'].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-SEC-003')?.status).toBe('unknown');
      expect(controlStatus(report, 'ADRB-SEC-003')?.evidence[0]?.status).toBe('not_met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('honors GitLab first-match rules after a non-merge rule', async () => {
    const repository = await gitFixture({
      '.gitlab-ci.yml': [
        'secret-scan:',
        '  rules:',
        `    - if: '$CI_PIPELINE_SOURCE == "push"'`,
        '      when: never',
        `    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'`,
        '  script: gitleaks detect',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-SEC-003')?.status).toBe('met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('rejects non-integration conditions, disabled triggers, and non-enforcing scanner text', async () => {
    const repository = await gitFixture({
      '.github/workflows/invalid.yml': [
        'on: [push, pull_request]',
        'jobs:',
        '  push-only:',
        '    runs-on: ubuntu-latest',
        "    if: github.event_name == 'push'",
        '    steps:',
        '      - run: gitleaks detect',
        '  bypasses:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: false && gitleaks detect',
        '      - run: gitleaks detect || true',
        "      - run: sh -c 'echo gitleaks'",
        '      - run: npm run gitleaks-info',
        '      - run: npx gitleaks-info',
        '      - run: gitleaks --version',
        '      - run: gitleaks help',
        '      - run: gitleaks detect --help',
        '      - run: gitleaks --version detect',
        '      - run: gitleaks detect --exit-code 0',
        '      - run: gitleaks detect --exit-code=0',
        "      - run: gitleaks detect --exit-code='0'",
        '      - run: gitleaks detect --exit-code="0"',
        '      - run: trufflehog git',
        '      - run: trufflehog git --fail=false',
        '      - run: trufflehog git --fail false',
        '      - run: detect-secrets scan',
        '      - uses: actions/checkout@gitleaks',
        '      - uses: gitleaks-logger/checkout@v1',
        '      - uses: attacker/gitleaks-action@v1',
        '      - uses: gitleaks/gitleaks-action',
        '      - if: failure()',
        '        run: gitleaks detect',
        "      - if: github.ref == 'refs/heads/impossible'",
        '        run: gitleaks detect',
        '      - continue-on-error: "true"',
        '        run: gitleaks detect',
        '      - continue-on-error: ${{ true }}',
        '        run: gitleaks detect',
        '      - run: set +e; gitleaks detect; exit 0',
        '      - run: gitleaks detect & echo done',
        "      - if: github.event_name == 'pull_request' && github.event_name == 'push'",
        '        run: gitleaks detect',
      ].join('\n'),
      '.github/workflows/closed.yml': [
        'on:',
        '  pull_request:',
        '    types: [closed]',
        'jobs:',
        '  scan:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: gitleaks detect',
      ].join('\n'),
      '.github/workflows/false-trigger.yml': [
        'on:',
        '  pull_request: false',
        'jobs:',
        '  scan:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: gitleaks detect',
      ].join('\n'),
      '.github/workflows/missing-runner.yml': [
        'on: [pull_request]',
        'jobs:',
        '  scan:',
        '    steps:',
        '      - uses: gitleaks/gitleaks-action@v2',
      ].join('\n'),
      '.github/workflows/reusable-job.yml': [
        'on: [pull_request]',
        'jobs:',
        '  scan:',
        '    uses: gitleaks/gitleaks-action@v2',
      ].join('\n'),
      '.github/workflows/path-gated.yml': [
        'on:',
        '  pull_request:',
        '    paths: [docs/**]',
        'jobs:',
        '  scan:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: gitleaks/gitleaks-action@v2',
      ].join('\n'),
      '.gitlab-ci.yml': [
        'secret-scan:',
        '  rules:',
        `    - if: '$CI_PIPELINE_SOURCE != "merge_request_event"'`,
        '  script: gitleaks detect',
      ].join('\n'),
      'azure-pipelines.yml': [
        'pr:',
        '  branches:',
        '    exclude: ["*"]',
        'steps:',
        '  - script: gitleaks detect',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const security = controlStatus(report, 'ADRB-SEC-003');
      expect(security?.status).toBe('unknown');
      expect(security?.evidence[0]?.status).toBe('not_met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('fails closed on unsupported GitLab and Azure enforcement gates', async () => {
    const configurations: Array<Record<string, string>> = [
      {
        '.gitlab-ci.yml': [
          'workflow:',
          '  rules:',
          '    - when: never',
          `    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'`,
          'secret-scan:',
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        '.gitlab-ci.yml': [
          'secret-scan:',
          '  rules:',
          `    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'`,
          '      allow_failure: true',
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        '.gitlab-ci.yml': [
          'secret-scan:',
          '  rules:',
          `    - if: '$CI_PIPELINE_SOURCE == "merge_request_event" && $RUN_SECRET_SCAN == "true"'`,
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        '.gitlab-ci.yml': [
          'secret-scan:',
          '  rules:',
          `    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'`,
          '      changes: [docs/**]',
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        '.gitlab-ci.yml': [
          'secret-scan:',
          '  only:',
          '    refs: [merge_requests]',
          '    changes: [docs/**]',
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        '.gitlab-ci.yml': [
          'secret-scan:',
          '  only: [merge_requests]',
          '  allow_failure:',
          '    exit_codes: [1]',
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        '.gitlab-ci.yml': [
          '.scan-template:',
          '  allow_failure: true',
          'secret-scan:',
          '  extends: .scan-template',
          '  only: [merge_requests]',
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        '.gitlab-ci.yml': [
          'default:',
          '  allow_failure: true',
          'secret-scan:',
          '  only: [merge_requests]',
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        '.gitlab-ci.yml': [
          'secret-scan:',
          '  only: [merge_requests]',
          '  except:',
          '    variables: [$SKIP_SECRET_SCAN]',
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        'azure-pipelines.yml': [
          'pr: [main]',
          'steps:',
          '  - script: gitleaks detect',
          "    condition: ne(variables['Build.Reason'], 'PullRequest')",
        ].join('\n'),
      },
      {
        'azure-pipelines.yml': [
          'pr: [main]',
          'steps:',
          '  - script: gitleaks detect',
          '    continueOnError: true',
        ].join('\n'),
      },
      {
        'azure-pipelines.yml': [
          'pr:',
          '  paths:',
          '    include: [docs/**]',
          'steps:',
          '  - script: gitleaks detect',
        ].join('\n'),
      },
    ];
    const repositories = await Promise.all(configurations.map(gitFixture));
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      for (const repository of repositories) {
        const report = await assess(repository, benchmark, controls, 'pr-creation');
        expect(controlStatus(report, 'ADRB-SEC-003')?.status).toBe('unknown');
        expect(controlStatus(report, 'ADRB-SEC-003')?.evidence[0]?.status).toBe('not_met');
      }
    } finally {
      await Promise.all(
        repositories.map(async (repository) => rm(repository, { recursive: true, force: true })),
      );
    }
  });

  it('recognizes case-insensitive ownership structures and GitLab refs mappings', async () => {
    const repository = await gitFixture({
      'CONTRIBUTING.md': 'The required reviewer provides approval and maintainers may merge.\n',
      'docs/governance/ownership.md': [
        '| COMPONENT | OWNER |',
        '| --- | --- |',
        '| packages/platform/** | @platform-team |',
        '',
        'Repository: @release-team',
      ].join('\n'),
      '.gitlab-ci.yml': [
        'secret-scan:',
        '  only:',
        '    refs: [merge_requests]',
        '  script: gitleaks detect',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const governance = controlStatus(report, 'ADRB-GOV-002');
      expect(governance?.status).toBe('met');
      expect(governance?.evidence[0]?.summary).toContain(
        '2 structurally identifiable assignment(s)',
      );
      expect(controlStatus(report, 'ADRB-SEC-003')?.status).toBe('met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('accepts source-backed SEC-007 enforcement at repository scope without an offline pass', async () => {
    const repository = await gitFixture({
      'harness/untrusted-input.test.ts': [
        'describe("untrusted input", () => {',
        '  it("denies unauthorized tool instructions", enforceHarnessBoundary);',
        '});',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const gitHead = execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim();
      const evidence: AgentEvidenceFile = {
        schema_version: '0.4.0',
        benchmark_version: '0.4.0',
        target: {
          repository: 'https://example.invalid/acme/repository.git',
          git_head: gitHead,
        },
        collector: { name: 'fixture-repository-reviewer', version: '1.0.0' },
        claims: {
          'ADRB-SEC-007': {
            status: 'met',
            scope: 'repository',
            summary: 'Tracked adversarial tests mechanically deny unauthorized tool instructions.',
            references: ['repo:harness/untrusted-input.test.ts#L1-L3'],
            collected_at: '2026-07-18T10:00:00.000Z',
            expires_at: '2026-08-17T10:00:00.000Z',
            error: null,
          },
        },
      };
      const baseline = await assess(repository, benchmark, controls, 'pr-creation');
      const assisted = await assess(repository, benchmark, controls, 'pr-creation', {
        agentEvidence: evidence,
        now: new Date('2026-07-18T12:00:00.000Z'),
      });
      expect(controlStatus(baseline, 'ADRB-SEC-007')?.status).toBe('unknown');
      expect(controlStatus(assisted, 'ADRB-SEC-007')?.status).toBe('met');
      expect(controlStatus(assisted, 'ADRB-SEC-007')?.confidence).toBe('agent-collected');
      expect(assisted.score.repository).toEqual(baseline.score.repository);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('omits non-attestable manual alternatives from generated attestation templates', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'adrb-v04-init-'));
    try {
      execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'init', repository], {
        cwd: resolve(import.meta.dirname, '..'),
        stdio: 'pipe',
      });
      const document = parse(
        await readFile(join(repository, '.agentic', 'attestations.yaml'), 'utf8'),
      ) as { attestations: Record<string, unknown> };
      expect(document.attestations).not.toHaveProperty('ADRB-SEC-003');
      expect(document.attestations).toHaveProperty('ADRB-SEC-007');
      expect(document.attestations).toHaveProperty('ADRB-SEC-005');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 30_000);
});
