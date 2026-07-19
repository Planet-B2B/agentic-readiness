import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { loadAttestations, loadBenchmark } from '../src/load.js';
import { toMarkdown } from '../src/report.js';
import { assess } from '../src/score.js';
import type { AgentEvidenceFile, AttestationFile } from '../src/schema.js';

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
    for (const id of ['ADRB-ENV-003', 'ADRB-SPC-003', 'ADRB-LRN-003']) {
      expect(controlStatus(report, id)?.confidence).toBe('repository-detected');
    }
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
      expect(resilience?.evidence[0]?.summary).toContain('semantic coverage 3/6');
      expect(resilience?.evidence[0]?.summary).toContain(
        'matched: mutation-scope, stop-trigger, escalation',
      );
      expect(resilience?.evidence[0]?.summary).toContain(
        'missing: resource-bounds, retry-bounds, recovery-ownership',
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
        'Edit only allowed paths and respect the task time, tool-call budget, and maximum attempts.',
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
      expect(resilience?.evidence[0]?.summary).toContain('semantic coverage 6/6');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('treats a compound out-of-bounds stop as both scope and stop evidence', async () => {
    const repository = await gitFixture({
      'AGENTS.md': [
        'Do not continue outside the allowed paths; escalate to the coordinator.',
        'Respect the token budget and maximum attempts.',
        'The rollback owner is responsible for recovery.',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-RES-002')?.status).toBe('met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('accepts restrictive language that imposes explicit upper bounds', async () => {
    const repository = await gitFixture({
      'AGENTS.md': [
        'Edit only allowed paths.',
        'The token budget must not exceed 1000 and the retry limit must not exceed three.',
        'If work leaves scope, stop and ask the coordinator.',
        'The rollback owner is responsible for recovery.',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-RES-002')?.status).toBe('met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it.each([
    {
      name: 'an unlimited resource budget',
      bounds: 'The token budget is unlimited and the maximum attempts is three.',
      missing: 'resource-bounds',
    },
    {
      name: 'an unbounded retry limit',
      bounds: 'The token budget is 1000 and the retry limit is unbounded.',
      missing: 'retry-bounds',
    },
  ])('rejects $name as containment evidence', async ({ bounds, missing }) => {
    const repository = await gitFixture({
      'AGENTS.md': [
        'Edit only allowed paths.',
        bounds,
        'If work leaves scope, stop and ask the coordinator.',
        'The rollback owner is responsible for recovery.',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const resilience = controlStatus(report, 'ADRB-RES-002');
      expect(resilience?.status).toBe('not_met');
      expect(resilience?.evidence[0]?.summary).toContain(`missing: ${missing}`);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it.each([
    {
      name: 'a resource budget without retry bounds',
      bounds: 'Respect the token budget.',
      missing: 'retry-bounds',
    },
    {
      name: 'retry bounds without a resource budget',
      bounds: 'Respect the maximum attempts.',
      missing: 'resource-bounds',
    },
  ])('rejects $name', async ({ bounds, missing }) => {
    const repository = await gitFixture({
      'AGENTS.md': [
        'Edit only allowed paths.',
        bounds,
        'If work leaves scope, stop and ask the coordinator.',
        'The rollback owner is responsible for recovery.',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const resilience = controlStatus(report, 'ADRB-RES-002');
      expect(resilience?.status).toBe('not_met');
      expect(resilience?.evidence[0]?.summary).toContain(`missing: ${missing}`);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('distinguishes partial evidence checks from control confidence', async () => {
    const repository = await gitFixture({
      'CONTRIBUTING.md': [
        '# Review governance',
        'The repository owner assigns a reviewer. The required reviewer provides approval.',
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

  it('rejects malformed CODEOWNERS owner fields and punctuation-only targets', async () => {
    const repository = await gitFixture({
      'CONTRIBUTING.md':
        'The required reviewer provides human approval and maintainers retain merge authority.\n',
      CODEOWNERS: ['* contact @platform-team for review', '--- @platform-team'].join('\n'),
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

  it('parses ownership tables in conventional files but excludes former-owner sections', async () => {
    const mapped = await gitFixture({
      'CONTRIBUTING.md':
        'The required reviewer provides human approval and maintainers retain merge authority.\n',
      'OWNERS.md': [
        '# Component ownership',
        '| Component | Owner |',
        '| --- | --- |',
        '| packages/platform/** | @platform-team |',
        '| Payments | @payments-team |',
      ].join('\n'),
    });
    const formerOnly = await gitFixture({
      'CONTRIBUTING.md':
        'The required reviewer provides human approval and maintainers retain merge authority.\n',
      'MAINTAINERS.md': '# Former maintainers\n\n- @old-team\n',
    });
    const nestedFormerOnly = await gitFixture({
      'CONTRIBUTING.md':
        'The required reviewer provides human approval and maintainers retain merge authority.\n',
      'docs/governance/ownership.md': [
        '# Ownership archive',
        '## Former maintainers',
        '### Platform',
        '| Component | Owner |',
        '| --- | --- |',
        '| packages/platform/** | @old-team |',
      ].join('\n'),
    });
    const plainFormerOnly = await gitFixture({
      'CONTRIBUTING.md':
        'The required reviewer provides human approval and maintainers retain merge authority.\n',
      MAINTAINERS: 'Former maintainers:\n- @old-team\n',
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const mappedReport = await assess(mapped, benchmark, controls, 'pr-creation');
      const formerReport = await assess(formerOnly, benchmark, controls, 'pr-creation');
      const nestedFormerReport = await assess(nestedFormerOnly, benchmark, controls, 'pr-creation');
      const plainFormerReport = await assess(plainFormerOnly, benchmark, controls, 'pr-creation');
      expect(controlStatus(mappedReport, 'ADRB-GOV-002')?.status).toBe('met');
      expect(controlStatus(formerReport, 'ADRB-GOV-002')?.status).toBe('not_met');
      expect(controlStatus(formerReport, 'ADRB-GOV-002')?.evidence[0]?.status).toBe('not_met');
      expect(controlStatus(nestedFormerReport, 'ADRB-GOV-002')?.status).toBe('not_met');
      expect(controlStatus(nestedFormerReport, 'ADRB-GOV-002')?.evidence[0]?.status).toBe(
        'not_met',
      );
      expect(controlStatus(plainFormerReport, 'ADRB-GOV-002')?.evidence[0]?.status).toBe('not_met');
    } finally {
      await rm(mapped, { recursive: true, force: true });
      await rm(formerOnly, { recursive: true, force: true });
      await rm(nestedFormerOnly, { recursive: true, force: true });
      await rm(plainFormerOnly, { recursive: true, force: true });
    }
  }, 30_000);

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

  it('does not splice ownership table rows across blank lines or section headings', async () => {
    const blankSeparated = await gitFixture({
      'CONTRIBUTING.md':
        'The required reviewer provides human approval and maintainers retain merge authority.\n',
      'docs/governance/ownership.md': [
        '| Component | Owner |',
        '',
        '| --- | --- |',
        '| packages/platform/** | @platform-team |',
      ].join('\n'),
    });
    const headingSeparated = await gitFixture({
      'CONTRIBUTING.md':
        'The required reviewer provides human approval and maintainers retain merge authority.\n',
      'docs/governance/ownership.md': [
        '| Component | Owner |',
        '## Unrelated section',
        '| --- | --- |',
        '| packages/platform/** | @platform-team |',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const blankReport = await assess(blankSeparated, benchmark, controls, 'pr-creation');
      const headingReport = await assess(headingSeparated, benchmark, controls, 'pr-creation');
      expect(controlStatus(blankReport, 'ADRB-GOV-002')?.evidence[0]?.status).toBe('not_met');
      expect(controlStatus(headingReport, 'ADRB-GOV-002')?.evidence[0]?.status).toBe('not_met');
    } finally {
      await rm(blankSeparated, { recursive: true, force: true });
      await rm(headingSeparated, { recursive: true, force: true });
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
      name: 'does not accept AI-qualified maintainer authority as human governance',
      guidance: 'AI maintainers may approve and AI maintainers may merge changes.\n',
    },
    {
      name: 'does not infer human authority from explicitly negated statements',
      guidance: 'No designated human may approve changes. No designated human may merge changes.\n',
    },
    {
      name: 'does not infer authority from negation after the matched term',
      guidance: 'Reviewer approval is not required. Human merge authority is prohibited.\n',
    },
    {
      name: 'does not drop negating labels before authority terms',
      guidance: 'Not allowed: reviewers may approve. Prohibited: maintainers may merge.\n',
    },
    {
      name: 'requires accountable actors instead of generic authority labels',
      guidance: 'Human approval is required. Human merge authority is documented.\n',
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
        '      - uses: actions/checkout@v4',
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
      expect(toMarkdown(executedReport)).toMatch(
        /\| ADRB-SEC-003[^\n]+\| 3 \| repository \| repository-detected \|/,
      );
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
      expect(toMarkdown(report)).toMatch(
        /\| ADRB-SEC-003[^\n]+\| 3 \| platform \| agent-collected \|/,
      );
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('resolves negative agent evidence only against its matching alternative', async () => {
    const repository = await gitFixture({ 'README.md': '# Fixture repository' });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const gitHead = execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim();
      const evidence = (scope: 'repository' | 'platform'): AgentEvidenceFile => ({
        schema_version: '0.4.0',
        benchmark_version: '0.4.0',
        target: {
          repository: 'https://example.invalid/acme/repository.git',
          git_head: gitHead,
        },
        collector: { name: 'fixture-negative-adapter', version: '1.0.0' },
        claims: {
          'ADRB-SEC-003': {
            status: 'not_met',
            scope,
            summary: `${scope} secret scanning is confirmed absent.`,
            references:
              scope === 'repository'
                ? ['repo:README.md#L1']
                : ['https://example.invalid/settings/security/secret-scanning'],
            collected_at: '2026-07-18T10:00:00.000Z',
            expires_at: '2026-08-17T10:00:00.000Z',
            error: null,
          },
        },
      });
      const repositoryNegative = await assess(repository, benchmark, controls, 'pr-creation', {
        agentEvidence: evidence('repository'),
        now: new Date('2026-07-18T12:00:00.000Z'),
      });
      const platformNegative = await assess(repository, benchmark, controls, 'pr-creation', {
        agentEvidence: evidence('platform'),
        now: new Date('2026-07-18T12:00:00.000Z'),
      });

      expect(controlStatus(repositoryNegative, 'ADRB-SEC-003')?.status).toBe('unknown');
      expect(controlStatus(repositoryNegative, 'ADRB-SEC-003')?.confidence).toBe('none');
      expect(toMarkdown(repositoryNegative)).toContain(
        'Control confidence: none — one evidence alternative must pass.',
      );
      expect(toMarkdown(repositoryNegative)).toContain('- **Agent-collected:** not_met');
      expect(controlStatus(platformNegative, 'ADRB-SEC-003')?.status).toBe('not_met');
      expect(controlStatus(platformNegative, 'ADRB-SEC-003')?.confidence).toBe('agent-collected');
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
        '    workingDirectory: $(Build.SourcesDirectory)',
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
        '      - uses: actions/checkout@v4',
        '      - run: trufflehog git file://. --fail',
      ].join('\n'),
    });
    const advisory = await gitFixture({
      '.github/workflows/security.yml': [
        'on: [pull_request]',
        'jobs:',
        '  scan:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: trufflehog git file://.',
      ].join('\n'),
    });
    const sourceLess = await gitFixture({
      '.github/workflows/security.yml': [
        'on: [pull_request]',
        'jobs:',
        '  scan:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: trufflehog git --fail',
      ].join('\n'),
    });
    const unrelatedSource = await gitFixture({
      '.github/workflows/security.yml': [
        'on: [pull_request]',
        'jobs:',
        '  scan:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: trufflehog filesystem /tmp/unrelated --fail',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const blockingReport = await assess(blocking, benchmark, controls, 'pr-creation');
      const advisoryReport = await assess(advisory, benchmark, controls, 'pr-creation');
      const sourceLessReport = await assess(sourceLess, benchmark, controls, 'pr-creation');
      const unrelatedSourceReport = await assess(
        unrelatedSource,
        benchmark,
        controls,
        'pr-creation',
      );
      expect(controlStatus(blockingReport, 'ADRB-SEC-003')?.status).toBe('met');
      expect(controlStatus(advisoryReport, 'ADRB-SEC-003')?.status).toBe('unknown');
      expect(controlStatus(sourceLessReport, 'ADRB-SEC-003')?.status).toBe('unknown');
      expect(controlStatus(unrelatedSourceReport, 'ADRB-SEC-003')?.status).toBe('unknown');
    } finally {
      await rm(blocking, { recursive: true, force: true });
      await rm(advisory, { recursive: true, force: true });
      await rm(sourceLess, { recursive: true, force: true });
      await rm(unrelatedSource, { recursive: true, force: true });
    }
  }, 30_000);

  it('binds git-secrets scans to the default repository target', async () => {
    const workflow = (command: string): Record<string, string> => ({
      '.github/workflows/security.yml': [
        'on: [pull_request]',
        'jobs:',
        '  scan:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        `      - run: ${command}`,
      ].join('\n'),
    });
    const repositoryScan = await gitFixture(workflow('git-secrets --scan'));
    const unrelatedScan = await gitFixture(workflow('git-secrets --scan /tmp/empty'));
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const repositoryReport = await assess(repositoryScan, benchmark, controls, 'pr-creation');
      const unrelatedReport = await assess(unrelatedScan, benchmark, controls, 'pr-creation');
      expect(controlStatus(repositoryReport, 'ADRB-SEC-003')?.status).toBe('met');
      expect(controlStatus(unrelatedReport, 'ADRB-SEC-003')?.status).toBe('unknown');
    } finally {
      await rm(repositoryScan, { recursive: true, force: true });
      await rm(unrelatedScan, { recursive: true, force: true });
    }
  });

  it('requires repository contents before repository-bound CI commands execute', async () => {
    const configurations: Array<Record<string, string>> = [
      {
        '.github/workflows/no-checkout.yml': [
          'on: [pull_request]',
          'jobs:',
          '  scan:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - run: gitleaks detect',
        ].join('\n'),
      },
      {
        '.github/workflows/late-checkout.yml': [
          'on: [pull_request]',
          'jobs:',
          '  scan:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - run: gitleaks detect',
          '      - uses: actions/checkout@v4',
        ].join('\n'),
      },
      {
        '.github/workflows/other-checkout.yml': [
          'on: [pull_request]',
          'jobs:',
          '  scan:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - uses: actions/checkout@v4',
          '        with:',
          '          repository: another/example',
          '      - run: gitleaks detect',
        ].join('\n'),
      },
      {
        '.github/workflows/replaced-checkout.yml': [
          'on: [pull_request]',
          'jobs:',
          '  scan:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - uses: actions/checkout@v4',
          '      - uses: actions/checkout@v4',
          '        with:',
          '          repository: another/example',
          '      - run: gitleaks detect',
        ].join('\n'),
      },
      {
        '.github/workflows/other-directory.yml': [
          'on: [pull_request]',
          'jobs:',
          '  scan:',
          '    runs-on: ubuntu-latest',
          '    defaults:',
          '      run:',
          '        working-directory: /tmp/unrelated',
          '    steps:',
          '      - uses: actions/checkout@v4',
          '      - run: gitleaks detect',
        ].join('\n'),
      },
      {
        '.github/workflows/conditional-replacement.yml': [
          'on: [pull_request]',
          'jobs:',
          '  scan:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - uses: actions/checkout@v4',
          '      - if: github.ref == refs/heads/main',
          '        uses: actions/checkout@v4',
          '        with:',
          '          repository: another/example',
          '      - run: gitleaks detect',
        ].join('\n'),
      },
      {
        '.gitlab-ci.yml': [
          'variables:',
          '  GIT_STRATEGY: none',
          'secret-scan:',
          '  only: [merge_requests]',
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        'azure-pipelines.yml': [
          'pr: [main]',
          'steps:',
          '  - checkout: none',
          '  - script: gitleaks detect',
        ].join('\n'),
      },
      {
        'azure-pipelines.yml': [
          'pr: [main]',
          'steps:',
          '  - checkout: self',
          '  - checkout: another-repository',
          "    condition: eq(variables['Build.SourceBranch'], 'refs/heads/main')",
          '  - script: gitleaks detect',
        ].join('\n'),
      },
    ];
    const repositories = await Promise.all(configurations.map(gitFixture));
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const statuses: Array<{ control: string | undefined; repository: string | undefined }> = [];
      for (const repository of repositories) {
        const report = await assess(repository, benchmark, controls, 'pr-creation');
        const security = controlStatus(report, 'ADRB-SEC-003');
        statuses.push({ control: security?.status, repository: security?.evidence[0]?.status });
      }
      expect(statuses).toEqual(
        configurations.map(() => ({ control: 'unknown', repository: 'not_met' })),
      );
    } finally {
      await Promise.all(
        repositories.map(async (repository) => rm(repository, { recursive: true, force: true })),
      );
    }
  }, 30_000);

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
      expect(resilience?.evidence[0]?.summary).toContain('missing: retry-bounds, escalation');
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
        'The recovery owner is TBD and the rollback owner is unknown.',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const resilience = controlStatus(report, 'ADRB-RES-002');
      expect(resilience?.status).toBe('not_met');
      expect(resilience?.evidence[0]?.summary).toContain('semantic coverage 0/6');
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
      'scripts/check-agent-docs.js': [
        "import { readFileSync } from 'node:fs';",
        "const guidance = readFileSync('AGENTS.md', 'utf8');",
        "if (!guidance.includes('scope')) throw new Error('AGENTS.md is invalid');",
      ].join('\n'),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run agent-doc-check',
        '      - run: npm test',
        '      - run: npm run typecheck',
      ].join('\n'),
    });
    const noOp = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { 'agent-doc-check': 'node scripts/check-agent-docs.js' },
      }),
      'scripts/check-agent-docs.js': [
        "// readFileSync('AGENTS.md'); throw new Error('invalid guidance');",
        "const target = 'agent guidance';",
        "const reader = 'readFileSync';",
        "const failure = 'throw new Error';",
        'export const validatesAgentGuidance = true;',
      ].join('\n'),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run agent-doc-check',
      ].join('\n'),
    });
    const multilineString = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { 'agent-doc-check': 'node scripts/check-agent-docs.js' },
      }),
      'scripts/check-agent-docs.js': [
        'export const description = `',
        "readFileSync('AGENTS.md');",
        "throw new Error('invalid guidance');",
        '`;',
      ].join('\n'),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run agent-doc-check',
      ].join('\n'),
    });
    const unreachable = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { 'agent-doc-check': 'node scripts/check-agent-docs.js' },
      }),
      'scripts/check-agent-docs.js': [
        'if (false) {',
        "  const guidance = readFileSync('AGENTS.md', 'utf8');",
        "  if (!guidance.includes('scope')) throw new Error('AGENTS.md is invalid');",
        '}',
      ].join('\n'),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run agent-doc-check',
      ].join('\n'),
    });
    const uncalled = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { 'agent-doc-check': 'node scripts/check-agent-docs.js' },
      }),
      'scripts/check-agent-docs.js': [
        'function validateGuidance() {',
        "  const guidance = readFileSync('AGENTS.md', 'utf8');",
        "  if (!guidance.includes('scope')) throw new Error('AGENTS.md is invalid');",
        '}',
      ].join('\n'),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run agent-doc-check',
      ].join('\n'),
    });
    const nestedUncalled = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { 'agent-doc-check': 'node scripts/check-agent-docs.js' },
      }),
      'scripts/check-agent-docs.js': [
        'function validateGuidance() {',
        "  const guidance = readFileSync('AGENTS.md', 'utf8');",
        "  if (!guidance.includes('scope')) throw new Error('AGENTS.md is invalid');",
        '}',
        'function unusedWrapper() {',
        '  validateGuidance();',
        '}',
      ].join('\n'),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run agent-doc-check',
      ].join('\n'),
    });
    const nestedDeclarationOnly = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { 'agent-doc-check': 'node scripts/check-agent-docs.js' },
      }),
      'scripts/check-agent-docs.js': [
        'function runValidation() {',
        '  function validateGuidance() {',
        "    const guidance = readFileSync('AGENTS.md', 'utf8');",
        "    if (!guidance.includes('scope')) throw new Error('AGENTS.md is invalid');",
        '  }',
        '}',
        'runValidation();',
      ].join('\n'),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run agent-doc-check',
      ].join('\n'),
    });
    const splitAcrossUncalledFunctions = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { 'agent-doc-check': 'node scripts/check-agent-docs.js' },
      }),
      'scripts/check-agent-docs.js': [
        'function readGuidance() {',
        "  return readFileSync('AGENTS.md', 'utf8');",
        '}',
        'function failGuidance() {',
        "  throw new Error('AGENTS.md is invalid');",
        '}',
      ].join('\n'),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run agent-doc-check',
      ].join('\n'),
    });
    const uncalledExpressionArrows = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { 'agent-doc-check': 'node scripts/check-agent-docs.js' },
      }),
      'scripts/check-agent-docs.js': [
        "const inspectGuidance = () => readFileSync('AGENTS.md', 'utf8');",
        'const failGuidance = () => process.exit(1);',
      ].join('\n'),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run agent-doc-check',
      ].join('\n'),
    });
    const called = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { 'agent-doc-check': 'node scripts/check-agent-docs.js' },
      }),
      'scripts/check-agent-docs.js': [
        'function validateGuidance() {',
        "  const guidance = readFileSync('AGENTS.md', 'utf8');",
        "  if (!guidance.includes('scope')) throw new Error('AGENTS.md is invalid');",
        '}',
        'validateGuidance();',
      ].join('\n'),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run agent-doc-check',
      ].join('\n'),
    });
    const transitivelyCalled = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { 'agent-doc-check': 'node scripts/check-agent-docs.js' },
      }),
      'scripts/check-agent-docs.js': [
        'function validateGuidance() {',
        "  const guidance = readFileSync('AGENTS.md', 'utf8');",
        "  if (!guidance.includes('scope')) throw new Error('AGENTS.md is invalid');",
        '}',
        'function runValidation() {',
        '  validateGuidance();',
        '}',
        'runValidation();',
      ].join('\n'),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run agent-doc-check',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const commentsReport = await assess(commentsOnly, benchmark, controls, 'pr-creation');
      const executedReport = await assess(executed, benchmark, controls, 'pr-creation');
      const noOpReport = await assess(noOp, benchmark, controls, 'pr-creation');
      const multilineStringReport = await assess(
        multilineString,
        benchmark,
        controls,
        'pr-creation',
      );
      const unreachableReport = await assess(unreachable, benchmark, controls, 'pr-creation');
      const uncalledReport = await assess(uncalled, benchmark, controls, 'pr-creation');
      const nestedUncalledReport = await assess(nestedUncalled, benchmark, controls, 'pr-creation');
      const nestedDeclarationReport = await assess(
        nestedDeclarationOnly,
        benchmark,
        controls,
        'pr-creation',
      );
      const splitUncalledReport = await assess(
        splitAcrossUncalledFunctions,
        benchmark,
        controls,
        'pr-creation',
      );
      const uncalledExpressionReport = await assess(
        uncalledExpressionArrows,
        benchmark,
        controls,
        'pr-creation',
      );
      const calledReport = await assess(called, benchmark, controls, 'pr-creation');
      const transitivelyCalledReport = await assess(
        transitivelyCalled,
        benchmark,
        controls,
        'pr-creation',
      );

      expect(controlStatus(commentsReport, 'ADRB-CTX-003')?.status).toBe('not_met');
      expect(controlStatus(commentsReport, 'ADRB-TST-003')?.status).toBe('not_met');
      expect(controlStatus(executedReport, 'ADRB-CTX-003')?.status).toBe('met');
      expect(controlStatus(executedReport, 'ADRB-TST-003')?.status).toBe('met');
      expect(controlStatus(noOpReport, 'ADRB-CTX-003')?.status).toBe('not_met');
      expect(controlStatus(multilineStringReport, 'ADRB-CTX-003')?.status).toBe('not_met');
      expect(controlStatus(unreachableReport, 'ADRB-CTX-003')?.status).toBe('not_met');
      expect(controlStatus(uncalledReport, 'ADRB-CTX-003')?.status).toBe('not_met');
      expect(controlStatus(nestedUncalledReport, 'ADRB-CTX-003')?.status).toBe('not_met');
      expect(controlStatus(nestedDeclarationReport, 'ADRB-CTX-003')?.status).toBe('not_met');
      expect(controlStatus(splitUncalledReport, 'ADRB-CTX-003')?.status).toBe('not_met');
      expect(controlStatus(uncalledExpressionReport, 'ADRB-CTX-003')?.status).toBe('not_met');
      expect(controlStatus(calledReport, 'ADRB-CTX-003')?.status).toBe('met');
      expect(controlStatus(transitivelyCalledReport, 'ADRB-CTX-003')?.status).toBe('met');
    } finally {
      await rm(commentsOnly, { recursive: true, force: true });
      await rm(executed, { recursive: true, force: true });
      await rm(noOp, { recursive: true, force: true });
      await rm(multilineString, { recursive: true, force: true });
      await rm(unreachable, { recursive: true, force: true });
      await rm(uncalled, { recursive: true, force: true });
      await rm(nestedUncalled, { recursive: true, force: true });
      await rm(nestedDeclarationOnly, { recursive: true, force: true });
      await rm(splitAcrossUncalledFunctions, { recursive: true, force: true });
      await rm(uncalledExpressionArrows, { recursive: true, force: true });
      await rm(called, { recursive: true, force: true });
      await rm(transitivelyCalled, { recursive: true, force: true });
    }
  }, 30_000);

  it('does not award enforced maturity from keyword-bearing no-op files', async () => {
    const repository = await gitFixture({
      'package.json': JSON.stringify({
        scripts: {
          'knowledge-curator': 'tsx scripts/check-knowledge.ts',
          'spec-check': 'tsx scripts/check-specs.ts',
        },
      }),
      'scripts/no-op.ts': [
        '// clean checkout, locked dependencies, test, and typecheck',
        '// acceptance criteria, traceability, spec check, and task id',
        '// curator, stale, contradiction, and duplicate knowledge',
        "export const description = 'documentation only';",
      ].join('\n'),
      'scripts/check-specs.ts':
        "export const description = \"readFileSync('specs/example.md'); includes('acceptance criteria'); throw new Error\";\n",
      'scripts/check-knowledge.ts':
        'export const description = "readFileSync(\'.ai/lessons.md\'); if (stale) throw new Error";\n',
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: echo no-op',
        '      - run: npm run spec-check',
        '      - run: npm run knowledge-curator',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-ENV-003')?.status).toBe('not_met');
      expect(controlStatus(report, 'ADRB-SPC-003')?.status).toBe('not_met');
      expect(controlStatus(report, 'ADRB-LRN-003')?.status).toBe('not_met');
    } finally {
      await rm(repository, { recursive: true, force: true });
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

  it('does not treat npm built-ins or arbitrary subcommands as implicit package scripts', async () => {
    const repository = await gitFixture({
      'package.json': JSON.stringify({ scripts: { ci: 'vitest run', lint: 'eslint .' } }),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm ci',
        '      - run: npm lint',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-TST-003')?.status).toBe('not_met');
      expect(controlStatus(report, 'ADRB-TST-003')?.evidence[0]?.summary).toContain(
        'aggregate command-class match 0/2',
      );
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('recognizes locked installs from each supported JavaScript package manager', async () => {
    const installers = [
      'pnpm install --frozen-lockfile',
      'yarn install --immutable',
      'bun install --frozen-lockfile',
    ];
    const repositories = await Promise.all(
      installers.map((installer) =>
        gitFixture({
          '.github/workflows/verify.yml': [
            'on: [pull_request]',
            'jobs:',
            '  verify:',
            '    runs-on: ubuntu-latest',
            '    steps:',
            '      - uses: actions/checkout@v4',
            `      - run: ${installer}`,
            '      - run: pytest',
            '      - run: mypy .',
          ].join('\n'),
        }),
      ),
    );
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      for (const repository of repositories) {
        const report = await assess(repository, benchmark, controls, 'pr-creation');
        expect(controlStatus(report, 'ADRB-ENV-003')?.status).toBe('met');
      }
    } finally {
      await Promise.all(
        repositories.map(async (repository) => rm(repository, { recursive: true, force: true })),
      );
    }
  });

  it('resolves explicit package task names with manifest case sensitivity', async () => {
    const files = (task: string): Record<string, string> => ({
      'package.json': JSON.stringify({ scripts: { lint: 'eslint .', Test: 'vitest run' } }),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        `      - run: npm run ${task}`,
        '      - run: npm run lint',
      ].join('\n'),
    });
    const wrongCase = await gitFixture(files('test'));
    const exactCase = await gitFixture(files('Test'));
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const wrongCaseReport = await assess(wrongCase, benchmark, controls, 'pr-creation');
      const exactCaseReport = await assess(exactCase, benchmark, controls, 'pr-creation');
      expect(controlStatus(wrongCaseReport, 'ADRB-TST-003')?.status).toBe('not_met');
      expect(controlStatus(exactCaseReport, 'ADRB-TST-003')?.status).toBe('met');
    } finally {
      await rm(wrongCase, { recursive: true, force: true });
      await rm(exactCase, { recursive: true, force: true });
    }
  });

  it('resolves package tasks after supported value-taking global options', async () => {
    const repository = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { lint: 'eslint .', test: 'vitest run' },
      }),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm --loglevel warn test',
        '      - run: npm --loglevel=warn run lint',
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

  it('rejects unresolved arguments forwarded to recognized package tasks', async () => {
    const repository = await gitFixture({
      'package.json': JSON.stringify({
        scripts: {
          lint: 'eslint .',
          'secret-scan': 'gitleaks detect',
          test: 'vitest run',
        },
      }),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run secret-scan -- --exit-code 0',
        '      - run: npm test -- --fixtures',
        '      - run: npm run lint',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-SEC-003')?.status).toBe('unknown');
      expect(controlStatus(report, 'ADRB-TST-003')?.status).toBe('not_met');
      expect(controlStatus(report, 'ADRB-TST-003')?.evidence[0]?.summary).toContain(
        'aggregate command-class match 1/2',
      );
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('does not bypass package-task binding through supported command wrappers', async () => {
    const repository = await gitFixture({
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: sudo npm test',
        '      - run: npx npm test',
        '      - run: mypy .',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-TST-003')?.status).toBe('not_met');
      expect(controlStatus(report, 'ADRB-TST-003')?.evidence[0]?.summary).toContain(
        'aggregate command-class match 1/2',
      );
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('fails closed on package-context switches but recognizes package exec targets', async () => {
    const contextSwitch = await gitFixture({
      'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm --prefix packages/noop test',
        '      - run: mypy .',
      ].join('\n'),
    });
    const packageExec = await gitFixture({
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: pnpm exec vitest',
        '      - run: npm exec eslint .',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const contextReport = await assess(contextSwitch, benchmark, controls, 'pr-creation');
      const execReport = await assess(packageExec, benchmark, controls, 'pr-creation');
      expect(controlStatus(contextReport, 'ADRB-TST-003')?.status).toBe('not_met');
      expect(controlStatus(execReport, 'ADRB-TST-003')?.status).toBe('met');
    } finally {
      await rm(contextSwitch, { recursive: true, force: true });
      await rm(packageExec, { recursive: true, force: true });
    }
  });

  it('rejects standalone test discovery and listing modes', async () => {
    const repository = await gitFixture({
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: pytest --fixtures',
        '      - run: pytest --fixtures=true',
        '      - run: pytest --markers',
        '      - run: nox --list-sessions',
        '      - run: nox -l',
        '      - run: nox -s docs',
        '      - run: tox -e docs',
        '      - run: go test -list .',
        '      - run: dotnet test --list-tests',
        '      - run: mypy .',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const testing = controlStatus(report, 'ADRB-TST-003');
      expect(testing?.status).toBe('not_met');
      expect(testing?.evidence[0]?.summary).toContain('aggregate command-class match 1/2');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('accepts pytest local-variable display as an executing test run', async () => {
    const repository = await gitFixture({
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: pytest -l',
        '      - run: mypy .',
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

  it('recognizes only tracked declared Maven and Gradle repository wrappers', async () => {
    const workflow = (wrapper: string, analysis: string): Record<string, string> => ({
      [wrapper]: '#!/bin/sh\nexit 0\n',
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        `      - run: ./${wrapper} test`,
        `      - run: ./${wrapper} ${analysis}`,
      ].join('\n'),
    });
    const maven = await gitFixture(workflow('mvnw', 'checkstyle:check'));
    const gradle = await gitFixture(workflow('gradlew', 'check'));
    const missingFiles = workflow('mvnw', 'checkstyle:check');
    delete missingFiles.mvnw;
    const missing = await gitFixture(missingFiles);
    const bareFiles = workflow('mvnw', 'checkstyle:check');
    const bareWorkflow = bareFiles['.github/workflows/verify.yml'] ?? '';
    bareFiles['.github/workflows/verify.yml'] = bareWorkflow.replaceAll('./mvnw', 'mvnw');
    const bare = await gitFixture(bareFiles);
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      for (const repository of [maven, gradle]) {
        const report = await assess(repository, benchmark, controls, 'pr-creation');
        expect(controlStatus(report, 'ADRB-TST-003')?.status).toBe('met');
      }
      const missingReport = await assess(missing, benchmark, controls, 'pr-creation');
      const bareReport = await assess(bare, benchmark, controls, 'pr-creation');
      expect(controlStatus(missingReport, 'ADRB-TST-003')?.status).toBe('not_met');
      expect(controlStatus(bareReport, 'ADRB-TST-003')?.status).toBe('not_met');
    } finally {
      await rm(maven, { recursive: true, force: true });
      await rm(gradle, { recursive: true, force: true });
      await rm(missing, { recursive: true, force: true });
      await rm(bare, { recursive: true, force: true });
    }
  });

  it('recognizes blocking verification commands in one multiline CI step', async () => {
    const repository = await gitFixture({
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: |',
        '          pytest',
        '          mypy .',
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

  it('does not assume Azure multiline scripts preserve an earlier command failure', async () => {
    const repository = await gitFixture({
      'azure-pipelines.yml': [
        'pr: [main]',
        'steps:',
        '  - checkout: self',
        '  - script: |',
        '      pytest',
        '      mypy .',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
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
        '      - uses: actions/checkout@v4',
        '      - run: pytest',
      ].join('\n'),
      '.github/workflows/static-analysis.yml': [
        'on: [pull_request]',
        'jobs:',
        '  static-analysis:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
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
        '      - uses: actions/checkout@v4',
        '      - run: npm --silent run test',
        '      - run: npm --silent run lint',
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

  it('rejects repository-owned executables that impersonate recognized tools by basename', async () => {
    const repository = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { lint: 'eslint .', scan: 'gitleaks detect', test: 'vitest run' },
      }),
      'scripts/gitleaks': '#!/bin/sh\necho no-op\n',
      'tools/npm': '#!/bin/sh\necho no-op\n',
      'tools/pytest': '#!/bin/sh\necho no-op\n',
      'tools/mypy': '#!/bin/sh\necho no-op\n',
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: ./scripts/gitleaks detect',
        '      - run: ./tools/npm run scan',
        '      - run: ./tools/npm test',
        '      - run: ./tools/npm run lint',
        '      - run: ./tools/pytest',
        '      - run: ./tools/mypy .',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-SEC-003')?.status).toBe('unknown');
      expect(controlStatus(report, 'ADRB-TST-003')?.status).toBe('not_met');
      expect(controlStatus(report, 'ADRB-TST-003')?.evidence[0]?.summary).toContain(
        'aggregate command-class match 0/2',
      );
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('does not inspect commands after an unconditional multiline exit', async () => {
    const repository = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { scan: 'exit 0\ngitleaks detect', verify: 'return 0\npytest\nmypy .' },
      }),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run scan',
        '      - run: npm run verify',
        '      - run: |',
        '          exit 0',
        '          gitleaks detect',
        '      - run: |',
        '          return 0',
        '          pytest',
        '          mypy .',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-SEC-003')?.status).toBe('unknown');
      expect(controlStatus(report, 'ADRB-TST-003')?.status).toBe('not_met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('rejects a specification validator that checks only a heading', async () => {
    const repository = await gitFixture({
      'package.json': JSON.stringify({ scripts: { 'spec-check': 'tsx scripts/check-specs.ts' } }),
      'scripts/check-specs.ts': [
        "const specification = readFileSync('specs/example.md', 'utf8');",
        "if (!specification.includes('Acceptance criteria')) throw new Error('missing heading');",
      ].join('\n'),
      'specs/example.md': '# Requirements\n\n## Acceptance criteria\n',
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run spec-check',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-SPC-003')?.status).toBe('not_met');
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

  it('recognizes GitHub jobs explicitly enabled for either integration event', async () => {
    const repository = await gitFixture({
      '.github/workflows/security.yml': [
        'on: [pull_request, merge_group]',
        'jobs:',
        '  scan:',
        '    runs-on: ubuntu-latest',
        "    if: github.event_name == 'pull_request' || github.event_name == 'merge_group'",
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: gitleaks detect',
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

  it('does not parse GitHub run text through an unsupported explicit shell', async () => {
    const repository = await gitFixture({
      '.github/workflows/security.yml': [
        'on: [pull_request]',
        'jobs:',
        '  scan:',
        '    runs-on: ubuntu-latest',
        '    defaults:',
        '      run:',
        '        shell: python',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: gitleaks detect',
        '      - shell: node {0}',
        '        run: gitleaks detect',
      ].join('\n'),
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
        '      - uses: actions/checkout@v4',
        '      - run: false && gitleaks detect',
        '      - run: gitleaks detect || true',
        "      - run: sh -c 'echo gitleaks'",
        '      - run: npm run gitleaks-info',
        '      - run: npx gitleaks-info',
        '      - run: npx --package gitleaks echo detect',
        '      - shell: python',
        '        run: gitleaks detect',
        '      - run: gitleaks --version',
        '      - run: gitleaks help',
        '      - run: gitleaks detect --help',
        '      - run: gitleaks --version detect',
        '      - run: gitleaks detect --exit-code 0',
        '      - run: gitleaks detect --exit-code=0',
        "      - run: gitleaks detect --exit-code='0'",
        '      - run: gitleaks detect --exit-code="0"',
        '      - run: gitleaks detect --exit-code=1',
        '      - run: gitleaks detect --exit-code=$CODE',
        '      - run: gitleaks detect --source /tmp/empty',
        '      - run: gitleaks detect --source=/tmp/empty',
        '      - run: gitleaks detect --log-opts=--max-count=1',
        '      - run: gitleaks protect',
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
        '      - run: exit 0 && gitleaks detect',
        '      - run: npm run missing && gitleaks detect',
        '      - run: cd /tmp/unrelated && gitleaks detect',
        '      - run: cd /tmp/unrelated && pytest && mypy .',
        '      - run: |',
        '          echo \\',
        '          gitleaks detect',
        '      - run: |',
        '          cat <<EOF',
        '          pytest',
        '          mypy .',
        '          EOF',
        "      - if: github.event_name == 'pull_request' && github.event_name == 'push'",
        '        run: gitleaks detect',
        "      - if: cancelled() && github.event_name == 'pull_request'",
        '        run: gitleaks detect',
        "      - if: '!success() && github.event_name == ''pull_request'''",
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
      expect(controlStatus(report, 'ADRB-TST-003')?.status).toBe('not_met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('fails closed on unsupported GitLab and Azure enforcement gates', async () => {
    const configurations: Array<Record<string, string>> = [
      {
        '.gitlab-ci.yml': [
          'include: local-ci.yml',
          'secret-scan:',
          '  only: [merge_requests]',
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        '.gitlab-ci.yml': [
          'before_script: [cd docs]',
          'secret-scan:',
          '  only: [merge_requests]',
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        '.gitlab-ci.yml': [
          'default:',
          '  before_script: [cd docs]',
          'secret-scan:',
          '  only: [merge_requests]',
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        '.gitlab-ci.yml': [
          'secret-scan:',
          '  only: [merge_requests]',
          '  before_script: [cd docs]',
          '  script: gitleaks detect',
        ].join('\n'),
      },
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
          'workflow: invalid',
          'secret-scan:',
          '  rules:',
          `    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'`,
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        '.gitlab-ci.yml': [
          'workflow:',
          '  rules: invalid',
          'secret-scan:',
          '  rules:',
          `    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'`,
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        '.gitlab-ci.yml': [
          'workflow:',
          '  rules:',
          `    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'`,
          'secret-scan:',
          '  rules: invalid',
          '  script: gitleaks detect',
        ].join('\n'),
      },
      {
        '.gitlab-ci.yml': [
          'workflow:',
          '  rules:',
          `    - if: '$CI_PIPELINE_SOURCE == "push"'`,
          'secret-scan:',
          '  only: [merge_requests]',
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
          '  when: on_failure',
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
          'stages:',
          '  - stage: Security',
          '    steps:',
          '      - script: gitleaks detect',
        ].join('\n'),
      },
      {
        'azure-pipelines.yml': [
          'pr: [main]',
          'steps:',
          '  - script: gitleaks detect',
          '    workingDirectory: /tmp/empty',
        ].join('\n'),
      },
      {
        'azure-pipelines.yml': [
          'pr: [main]',
          'jobs:',
          '  - job: Security',
          '    steps:',
          '      - script: echo no-op',
          'steps:',
          '  - script: gitleaks detect',
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
  }, 30_000);

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

  it('keeps source-bound validation linear for a long single-line script', async () => {
    const padding = 'x'.repeat(120_000);
    const repository = await gitFixture({
      'AGENTS.md': 'Keep every change within the authorized scope.\n',
      'package.json': JSON.stringify({
        scripts: { 'agent-doc-check': 'node scripts/check-agent-docs.js' },
      }),
      'scripts/check-agent-docs.js': [
        `function validateGuidance(){const padding="${padding}";const guidance=readFileSync('AGENTS.md','utf8');if(!guidance.includes('scope'))throw new Error('invalid guidance');return padding.length}`,
        'validateGuidance();',
      ].join('\n'),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run agent-doc-check',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-CTX-003')?.status).toBe('met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 10_000);

  it('honors workflow run defaults instead of resolving root tasks from another directory', async () => {
    const repository = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' },
      }),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'defaults:',
        '  run:',
        '    working-directory: packages/app',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm test',
        '      - run: npm run typecheck',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      expect(controlStatus(report, 'ADRB-TST-003')?.status).toBe('not_met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('uses shell fail-fast semantics for multiline secret-scan gates', async () => {
    const workflow = (shell?: string, runner = 'ubuntu-latest') =>
      [
        'on: [pull_request]',
        'jobs:',
        '  scan:',
        `    runs-on: ${runner}`,
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: |',
        '          gitleaks detect',
        '          echo scan-complete',
        ...(shell ? [`        shell: ${shell}`] : []),
      ].join('\n');
    const failFast = await gitFixture({ '.github/workflows/scan.yml': workflow() });
    const rawShell = await gitFixture({ '.github/workflows/scan.yml': workflow('bash {0}') });
    const windowsDefault = await gitFixture({
      '.github/workflows/scan.yml': workflow(undefined, 'windows-latest'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const failFastReport = await assess(failFast, benchmark, controls, 'pr-creation');
      const rawShellReport = await assess(rawShell, benchmark, controls, 'pr-creation');
      const windowsDefaultReport = await assess(windowsDefault, benchmark, controls, 'pr-creation');
      expect(controlStatus(failFastReport, 'ADRB-SEC-003')?.status).toBe('met');
      expect(controlStatus(rawShellReport, 'ADRB-SEC-003')?.status).toBe('unknown');
      expect(controlStatus(windowsDefaultReport, 'ADRB-SEC-003')?.status).toBe('unknown');
    } finally {
      await rm(failFast, { recursive: true, force: true });
      await rm(rawShell, { recursive: true, force: true });
      await rm(windowsDefault, { recursive: true, force: true });
    }
  });

  it('recognizes current CODEOWNERS syntax without reviving retired owners', async () => {
    const authority = 'The reviewer provides approval and maintainers may merge.\n';
    const current = await gitFixture({
      'CONTRIBUTING.md': authority,
      'docs/CODEOWNERS': '*.js @js-owner #This is an inline comment.\n',
    });
    const retired = await gitFixture({
      'CONTRIBUTING.md': authority,
      'OWNERS.md': ['## Former maintainers', 'Contact:', '- @alice'].join('\n'),
    });
    const namedEmail = await gitFixture({
      'CONTRIBUTING.md': authority,
      'MAINTAINERS.md': '- Alice Example <alice@example.com>\n',
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const currentReport = await assess(current, benchmark, controls, 'pr-creation');
      const retiredReport = await assess(retired, benchmark, controls, 'pr-creation');
      const namedEmailReport = await assess(namedEmail, benchmark, controls, 'pr-creation');
      expect(controlStatus(currentReport, 'ADRB-GOV-002')?.status).toBe('met');
      expect(controlStatus(retiredReport, 'ADRB-GOV-002')?.status).toBe('not_met');
      expect(controlStatus(namedEmailReport, 'ADRB-GOV-002')?.status).toBe('met');
    } finally {
      await rm(current, { recursive: true, force: true });
      await rm(retired, { recursive: true, force: true });
      await rm(namedEmail, { recursive: true, force: true });
    }
  });

  it('preserves only checkouts that use a separate, explicit subdirectory', async () => {
    const workflow = (path: string) =>
      [
        'on: [pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - uses: actions/checkout@v4',
        '        with:',
        '          repository: acme/shared-tools',
        `          path: ${path}`,
        '      - run: npm test',
        '      - run: npm run typecheck',
      ].join('\n');
    const separate = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' },
      }),
      '.github/workflows/verify.yml': workflow('vendor/shared-tools'),
    });
    const rootReplacement = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' },
      }),
      '.github/workflows/verify.yml': workflow('.'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const separateReport = await assess(separate, benchmark, controls, 'pr-creation');
      const rootReplacementReport = await assess(
        rootReplacement,
        benchmark,
        controls,
        'pr-creation',
      );
      expect(controlStatus(separateReport, 'ADRB-TST-003')?.status).toBe('met');
      expect(controlStatus(rootReplacementReport, 'ADRB-TST-003')?.status).toBe('not_met');
    } finally {
      await rm(separate, { recursive: true, force: true });
      await rm(rootReplacement, { recursive: true, force: true });
    }
  });

  it('accepts fail-fast Azure block scripts while rejecting disjoint environment jobs', async () => {
    const azure = await gitFixture({
      'azure-pipelines.yml': [
        'pr: [main]',
        'steps:',
        '  - checkout: self',
        '  - script: |',
        '      set -e',
        '      pytest',
        '      mypy .',
      ].join('\n'),
    });
    const powershell = await gitFixture({
      'azure-pipelines.yml': [
        'pr: [main]',
        'steps:',
        '  - checkout: self',
        '  - pwsh: |',
        '      set -e',
        '      pytest',
        '      mypy .',
      ].join('\n'),
    });
    const disjoint = await gitFixture({
      'package.json': JSON.stringify({
        scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' },
      }),
      '.github/workflows/verify.yml': [
        'on: [pull_request]',
        'jobs:',
        '  install:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm ci',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm test',
        '      - run: npm run typecheck',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const azureReport = await assess(azure, benchmark, controls, 'pr-creation');
      const powershellReport = await assess(powershell, benchmark, controls, 'pr-creation');
      const disjointReport = await assess(disjoint, benchmark, controls, 'pr-creation');
      expect(controlStatus(azureReport, 'ADRB-TST-003')?.status).toBe('met');
      expect(controlStatus(powershellReport, 'ADRB-TST-003')?.status).toBe('not_met');
      expect(controlStatus(disjointReport, 'ADRB-ENV-003')?.status).toBe('not_met');
    } finally {
      await rm(azure, { recursive: true, force: true });
      await rm(powershell, { recursive: true, force: true });
      await rm(disjoint, { recursive: true, force: true });
    }
  }, 30_000);

  it('rejects malformed and unknown v0.4 attestation control IDs', async () => {
    const repository = await gitFixture({ 'README.md': '# Fixture\n' });
    const attestation = (controlId: string): AttestationFile => ({
      benchmark_version: '0.4.0',
      target: { repository: 'https://example.invalid/acme/repository.git' },
      attestations: {
        [controlId]: {
          status: 'met',
          evidence: 'https://example.invalid/evidence',
          owner: 'Security owner',
          reviewed_at: '2026-07-19',
          expires_at: '2026-10-19',
        },
      },
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const validReport = await assess(repository, benchmark, controls, 'pr-creation', {
        attestations: attestation('ADRB-SEC-003'),
        now: new Date('2026-07-19T12:00:00.000Z'),
      });
      expect(controlStatus(validReport, 'ADRB-SEC-003')?.status).toBe('met');
      expect(controlStatus(validReport, 'ADRB-SEC-003')?.confidence).toBe('attested');
      await expect(
        assess(repository, benchmark, controls, 'pr-creation', {
          attestations: attestation('ADRB-SEC-999'),
        }),
      ).rejects.toThrow('unknown control ADRB-SEC-999');
      await expect(
        assess(repository, benchmark, controls, 'pr-creation', {
          attestations: attestation('ADRB-SECURITY-003'),
        }),
      ).rejects.toThrow('malformed control ID ADRB-SECURITY-003');
      await expect(
        assess(repository, benchmark, controls, 'pr-creation', {
          attestations: {
            ...attestation('ADRB-SEC-003'),
            target: { repository: 'https://example.invalid/other/repository.git' },
          },
        }),
      ).rejects.toThrow('does not match https://example.invalid/acme/repository.git');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('keeps v0.4 attestation runtime validation strict at file and claim boundaries', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'adrb-v04-attestation-schema-'));
    const path = join(directory, 'attestations.yaml');
    const document = [
      'benchmark_version: 0.4.0',
      'target:',
      '  repository: https://example.invalid/acme/repository.git',
      'attestations:',
      '  ADRB-SEC-003:',
      '    status: met',
      '    evidence: https://example.invalid/evidence',
      '    owner: Security owner',
      '    reviewed_at: 2026-07-19',
      '    expires_at: 2026-10-19',
    ];
    try {
      await writeFile(path, [...document, 'unexpected: true', ''].join('\n'), 'utf8');
      await expect(loadAttestations(path, '0.4.0')).rejects.toThrow();
      await writeFile(
        path,
        [...document, '    unexpected_claim_field: true', ''].join('\n'),
        'utf8',
      );
      await expect(loadAttestations(path, '0.4.0')).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('accepts a valid source-backed SEC-007 agent claim without relabelling it offline evidence', async () => {
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

  it('includes every attestable manual alternative in generated templates', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'adrb-v04-init-'));
    try {
      execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'init', repository], {
        cwd: resolve(import.meta.dirname, '..'),
        stdio: 'pipe',
      });
      const document = parse(
        await readFile(join(repository, '.agentic', 'attestations.yaml'), 'utf8'),
      ) as { target: { repository: string }; attestations: Record<string, unknown> };
      expect(document.target.repository).toBe(await realpath(repository));
      expect(document.attestations).toHaveProperty('ADRB-SEC-003');
      expect(document.attestations).toHaveProperty('ADRB-SEC-007');
      expect(document.attestations).toHaveProperty('ADRB-SEC-005');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 30_000);
});
