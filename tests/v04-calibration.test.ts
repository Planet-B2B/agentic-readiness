import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadBenchmark } from '../src/load.js';
import { toMarkdown } from '../src/report.js';
import { assess } from '../src/score.js';

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
      expect(markdown).toContain('Blocking checks: `repository/ownership_map`.');
      expect(markdown).toContain('Control confidence: none.');
      expect(markdown).not.toContain('Evidence confidence: none.');
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

      expect(controlStatus(keywordReport, 'ADRB-SEC-003')?.status).toBe('not_met');
      expect(controlStatus(executedReport, 'ADRB-SEC-003')?.status).toBe('met');
      expect(controlStatus(executedReport, 'ADRB-SEC-003')?.evidence[0]?.type).toBe('ci_command');
      expect(controlStatus(executedReport, 'ADRB-SEC-007')?.status).toBe('unknown');
      expect(controlStatus(executedReport, 'ADRB-SEC-007')?.evidence[0]?.type).toBe('manual');
    } finally {
      await rm(keywordOnly, { recursive: true, force: true });
      await rm(executed, { recursive: true, force: true });
    }
  });
});
