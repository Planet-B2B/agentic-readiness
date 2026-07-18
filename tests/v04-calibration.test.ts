import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
        'A repository owner assigns the required reviewer and approval.',
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
      ].join('\n'),
      'MAINTAINERS.md': '# Maintainers\n\n- Security team handbook\n',
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

  it('requires authority guidance in addition to an ownership map', async () => {
    const repository = await gitFixture({
      'CONTRIBUTING.md': 'Repository owners select reviewers for each change.\n',
      'OWNERS.md': '- @platform-team\n',
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const governance = controlStatus(report, 'ADRB-GOV-002');

      expect(governance?.status).toBe('not_met');
      expect(governance?.evidence.map(({ status }) => status)).toEqual(['met', 'not_met']);
      expect(governance?.evidence[1]?.summary).toContain('semantic coverage 0/1');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('does not infer positive authority from a statement denying agent authority', async () => {
    const repository = await gitFixture({
      'CONTRIBUTING.md': [
        'Repository owners select reviewers for each change.',
        'Green CI is not merge authority, and agents cannot approve changes.',
      ].join('\n'),
      'OWNERS.md': '- @platform-team\n',
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const governance = controlStatus(report, 'ADRB-GOV-002');

      expect(governance?.status).toBe('not_met');
      expect(governance?.evidence.map(({ status }) => status)).toEqual(['met', 'not_met']);
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
      expect(governance?.evidence[1]?.status).toBe('met');
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
        'on: [pull_request]',
        'jobs:',
        '  scan:',
        '    steps:',
        '      - run: gitleaks detect',
      ].join('\n'),
    });
    const nonEnforced = await gitFixture({
      '.github/workflows/echo.yml': [
        'name: Echo only',
        'on: [pull_request]',
        'jobs:',
        '  scan:',
        '    steps:',
        '      - run: echo gitleaks',
      ].join('\n'),
      '.github/workflows/disabled.yml': [
        'name: Disabled scan',
        'on: [pull_request]',
        'jobs:',
        '  scan:',
        '    steps:',
        '      - if: false',
        '        run: gitleaks detect',
      ].join('\n'),
      '.github/workflows/manual.yml': [
        'name: Manual scan',
        'on: [workflow_dispatch]',
        'jobs:',
        '  scan:',
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
        '0 CI configuration file(s) contain an enabled integration-triggered scanner invocation',
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
});
