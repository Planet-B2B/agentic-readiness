import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import fg from 'fast-glob';
import { describe, expect, it } from 'vitest';

import { loadAttestations, loadBenchmark } from '../src/load.js';
import { toMarkdown } from '../src/report.js';
import { repositoryEvidenceTarget } from '../src/repository.js';
import { assess } from '../src/score.js';
import type { AgentEvidenceFile } from '../src/schema.js';

const v03Root = resolve(import.meta.dirname, '..', 'benchmark', 'v0.3');

async function gitFixture(files: Record<string, string>): Promise<string> {
  const repository = await mkdtemp(join(tmpdir(), 'adrb-v03-'));
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

async function gitDirectoryFixture(directory: string): Promise<string> {
  const paths = await fg('**/*', { cwd: directory, dot: true, onlyFiles: true });
  const entries = await Promise.all(
    paths.map(async (path) => [path, await readFile(join(directory, path), 'utf8')] as const),
  );
  return gitFixture(Object.fromEntries(entries));
}

function controlStatus(report: Awaited<ReturnType<typeof assess>>, id: string) {
  return report.controls.find((control) => control.id === id);
}

describe('v0.3 accuracy regressions', () => {
  it('retains the mature level-three conformance result', async () => {
    const repository = resolve(import.meta.dirname, 'fixtures', 'mature');
    const { benchmark, controls } = await loadBenchmark(v03Root);
    const attestations = await loadAttestations(
      join(repository, '.agentic', 'attestations-v0.3.yaml'),
      benchmark.version,
    );
    const report = await assess(repository, benchmark, controls, 'limited-autonomous-maintenance', {
      attestations,
      now: new Date('2026-07-17T12:00:00.000Z'),
    });
    expect(report.score.total).toBe(30);
    expect(report.score.repository).toEqual({ achieved: 23, ceiling: 23, percentage: 100 });
    expect(report.readiness.target_passed).toBe(true);
    expect(report.readiness.highest_profile).toBe('limited-autonomous-maintenance');
    const targetProfile = report.profiles.find(({ id }) => id === 'limited-autonomous-maintenance');
    expect(targetProfile?.evidence_dependencies?.attested).toBeGreaterThan(0);
    const markdown = toMarkdown(report);
    expect(markdown).toContain('PASS (depends on');
    expect(markdown).toContain('Assessment mode: **evidence-assisted assessment**');
  });

  it(
    'continues a default assessment with a prominent warning for v0.2 artifacts',
    { timeout: 30_000 },
    async () => {
      const repository = await gitDirectoryFixture(
        resolve(import.meta.dirname, 'fixtures', 'mature'),
      );
      const cli = resolve(import.meta.dirname, '..', 'src', 'cli.ts');
      try {
        const output = execFileSync(
          process.execPath,
          [
            '--import',
            'tsx',
            cli,
            'assess',
            repository,
            '--profile',
            'pr-creation',
            '--format',
            'json',
          ],
          { encoding: 'utf8', timeout: 25_000 },
        );
        const report = JSON.parse(output) as { warnings?: string[] };
        expect(report.warnings).toHaveLength(2);
        expect(report.warnings?.[0]).toContain('Ignored auto-loaded attestation file');
        expect(report.warnings?.[0]).toContain('agentic-scorecard init --force');
        expect(report.warnings?.[1]).toContain('Repository-only baseline');
      } finally {
        await rm(repository, { recursive: true, force: true });
      }
    },
  );

  it('labels a zero-supplemental-evidence result as a repository-only baseline', async () => {
    const repository = await gitFixture({ 'README.md': '# Minimal repository' });
    try {
      const { benchmark, controls } = await loadBenchmark(v03Root);
      const report = await assess(repository, benchmark, controls, 'planning');
      const markdown = toMarkdown(report);

      expect(report.warnings).toHaveLength(1);
      expect(report.warnings?.[0]).toContain('Repository-only baseline');
      expect(markdown).toContain('Assessment mode: **repository-only baseline**');
      expect(markdown.indexOf('Repository-detected progress')).toBeLessThan(
        markdown.indexOf('Normative readiness score'),
      );

      const evidenceAssisted = await assess(repository, benchmark, controls, 'planning', {
        attestations: {
          benchmark_version: '0.3.0',
          attestations: {
            'ADRB-GOV-003': {
              status: 'not_met',
              evidence: 'https://example.invalid/settings/rules',
              owner: 'Fixture owner',
              reviewed_at: '2026-07-18',
              expires_at: '2026-08-18',
            },
          },
        },
        now: new Date('2026-07-18T12:00:00.000Z'),
      });
      expect(evidenceAssisted.warnings).toHaveLength(0);
      expect(toMarkdown(evidenceAssisted)).toContain(
        'Assessment mode: **evidence-assisted assessment**',
      );
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('warns when tracked results include uncommitted tracked-file contents', async () => {
    const repository = await gitFixture({ 'README.md': '# Minimal repository' });
    try {
      await writeFile(join(repository, 'README.md'), '# Changed after commit', 'utf8');
      const { benchmark, controls } = await loadBenchmark(v03Root);
      const report = await assess(repository, benchmark, controls, 'planning');

      expect(report.warnings).toHaveLength(2);
      expect(report.warnings?.[0]).toContain('uncommitted tracked-file contents');
      expect(report.warnings?.[1]).toContain('Repository-only baseline');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('recognizes a Dialer-style Cursor harness and capitalized Agents.md', async () => {
    const repository = await gitFixture({
      'Agents.md': [
        '# Agent guidance',
        'Scope and precedence: these architecture constraints must apply to every agent change.',
      ].join('\n'),
      'CLAUDE.md': 'Use the repository agent guidance and its constraints.',
      '.cursor/mcp.json': '{"mcpServers":{"project":{}}}',
      '.cursor/rules/security.md': [
        '# Agent security',
        'Never commit secrets or credentials. Keep PII and other sensitive data out of prompts and logs.',
      ].join('\n'),
      '.cursor/skills/post-plan-code-review/SKILL.md': [
        '# Post-plan code review',
        'Before merge, review every pull request and record approval after testing.',
      ].join('\n'),
      '.cursor/plans/example.plan.md': [
        'Title: Example',
        'Acceptance criteria: preserve tenant isolation.',
        'Constraints: no cross-tenant access.',
        'Verification: review the implementation.',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v03Root);
      const report = await assess(repository, benchmark, controls, 'planning');
      expect(controlStatus(report, 'ADRB-CTX-001')?.status).toBe('met');
      expect(controlStatus(report, 'ADRB-CTX-002')?.status).toBe('met');
      expect(controlStatus(report, 'ADRB-GOV-001')?.status).toBe('met');
      expect(controlStatus(report, 'ADRB-SEC-001')?.status).toBe('met');
      expect(controlStatus(report, 'ADRB-TOL-001')?.status).toBe('met');
      expect(controlStatus(report, 'ADRB-SPC-001')?.status).toBe('met');
      expect(report.readiness.target_passed).toBe(true);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('recognizes a Python/uv harness without inferring a structural runtime pin', async () => {
    const repository = await gitDirectoryFixture(
      resolve(import.meta.dirname, 'fixtures', 'python-harness'),
    );
    try {
      const { benchmark, controls } = await loadBenchmark(v03Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');

      expect(report.score.total).toBe(7);
      expect(report.score.repository).toEqual({ achieved: 7, ceiling: 23, percentage: 30 });
      expect(report.readiness.highest_profile).toBeNull();
      expect(report.readiness.target_passed).toBe(false);
      expect(controlStatus(report, 'ADRB-ENV-001')?.status).toBe('met');
      expect(controlStatus(report, 'ADRB-ENV-002')?.status).toBe('not_met');
      expect(controlStatus(report, 'ADRB-ENV-003')?.status).toBe('met');
      expect(controlStatus(report, 'ADRB-SPC-001')?.status).toBe('met');
      expect(controlStatus(report, 'ADRB-SPC-002')?.status).toBe('met');
      expect(controlStatus(report, 'ADRB-TST-001')?.status).toBe('met');
      expect(controlStatus(report, 'ADRB-TST-002')?.status).toBe('met');
      expect(controlStatus(report, 'ADRB-TST-003')?.status).toBe('met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('recognizes generic .ai tooling without letting distant or run-output keywords pass', async () => {
    const repository = await gitFixture({
      'AGENTS.md': [
        '# Agent workflow',
        'Owners assign a reviewer. Approval is required before maintainers merge a pull request.',
      ].join('\n'),
      '.github/CODEOWNERS': '* @maintainers',
      '.ai/agentic.config.json': '{"validation":{"commands":["npm test"]}}',
      '.ai/runs/example.md': 'task actor harness result timestamp evidence',
      '.ai/skills/security/SKILL.md':
        'Agent security review checks privilege escalation, tenant isolation, and request budget.',
      'scripts/dev.mjs': [
        'export function validate() { return true }',
        ...Array.from({ length: 30 }, (_, index) => `// unrelated line ${index}`),
        '// AGENTS.md is mentioned far away',
      ].join('\n'),
      'scripts/stale-cache.test.ts': 'it("detects stale duplicate cache records", () => {})',
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v03Root);
      const report = await assess(repository, benchmark, controls, 'planning');
      expect(controlStatus(report, 'ADRB-TOL-001')?.status).toBe('met');
      expect(controlStatus(report, 'ADRB-GOV-002')?.status).toBe('met');
      expect(controlStatus(report, 'ADRB-CTX-003')?.status).toBe('not_met');
      expect(controlStatus(report, 'ADRB-LRN-003')?.status).toBe('not_met');
      expect(controlStatus(report, 'ADRB-OBS-001')?.status).toBe('not_met');
      expect(controlStatus(report, 'ADRB-RES-002')?.status).toBe('not_met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('accepts source-backed repository claims without inflating deterministic progress', async () => {
    const repository = await gitFixture({
      'README.md': 'Fixture repository',
      'POLICIES/AI-SAFETY.md': [
        '# AI safety',
        'Agents must not disclose secrets or credentials and must keep sensitive data out of logs.',
      ].join('\n'),
      'POLICIES/AI#SAFETY.md': [
        '# Ambiguous AI safety path',
        'This tracked filename must not be accepted as a repository citation.',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v03Root);
      const baseline = await assess(repository, benchmark, controls, 'planning');
      expect(baseline.score.repository?.ceiling).toBe(23);
      const repositoryTarget = repositoryEvidenceTarget({
        root: repository,
        scope: 'tracked',
        git_head: execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim(),
        git_remote: 'https://example.invalid/acme/repository.git',
        working_tree_dirty: false,
        tracked_tree_dirty: false,
      });
      if (!repositoryTarget.git_head) throw new Error('Missing fixture commit');
      const target = { ...repositoryTarget, git_head: repositoryTarget.git_head };
      const evidence: AgentEvidenceFile = {
        schema_version: '0.3.0',
        benchmark_version: '0.3.0',
        target,
        collector: { name: 'fixture-agent', version: '1.0.0' },
        claims: {
          'ADRB-SEC-001': {
            status: 'met',
            scope: 'repository',
            summary: 'A tracked policy defines agent secret and sensitive-data boundaries.',
            references: ['repo:POLICIES/AI-SAFETY.md#L1-L2'],
            collected_at: '2026-07-17T10:00:00.000Z',
            expires_at: '2026-08-17T10:00:00.000Z',
            error: null,
          },
        },
      };
      const report = await assess(repository, benchmark, controls, 'planning', {
        agentEvidence: evidence,
        now: new Date('2026-07-17T12:00:00.000Z'),
      });
      expect(controlStatus(baseline, 'ADRB-SEC-001')?.status).toBe('not_met');
      expect(controlStatus(report, 'ADRB-SEC-001')?.status).toBe('met');
      expect(controlStatus(report, 'ADRB-SEC-001')?.confidence).toBe('agent-collected');
      expect(report.score.repository).toEqual(baseline.score.repository);

      await writeFile(join(repository, 'untracked-report.md'), 'generated output', 'utf8');
      const withUntrackedOutput = await assess(repository, benchmark, controls, 'planning', {
        agentEvidence: evidence,
        now: new Date('2026-07-17T12:00:00.000Z'),
      });
      expect(controlStatus(withUntrackedOutput, 'ADRB-SEC-001')?.status).toBe('met');

      const invalidReference = structuredClone(evidence);
      const claim = invalidReference.claims['ADRB-SEC-001'];
      if (!claim) throw new Error('Missing fixture claim');
      claim.references = ['repo:POLICIES/MISSING.md'];
      await expect(
        assess(repository, benchmark, controls, 'planning', {
          agentEvidence: invalidReference,
          now: new Date('2026-07-17T12:00:00.000Z'),
        }),
      ).rejects.toThrow('unavailable tracked path');

      const ambiguousReference = structuredClone(evidence);
      const ambiguousClaim = ambiguousReference.claims['ADRB-SEC-001'];
      if (!ambiguousClaim) throw new Error('Missing fixture claim');
      ambiguousClaim.references = ['repo:POLICIES/AI#SAFETY.md#L1-L2'];
      await expect(
        assess(repository, benchmark, controls, 'planning', {
          agentEvidence: ambiguousReference,
          now: new Date('2026-07-17T12:00:00.000Z'),
        }),
      ).rejects.toThrow('unavailable tracked path');

      const reversedRange = structuredClone(evidence);
      const reversedRangeClaim = reversedRange.claims['ADRB-SEC-001'];
      if (!reversedRangeClaim) throw new Error('Missing fixture claim');
      reversedRangeClaim.references = ['repo:POLICIES/AI-SAFETY.md#L2-L1'];
      await expect(
        assess(repository, benchmark, controls, 'planning', {
          agentEvidence: reversedRange,
          now: new Date('2026-07-17T12:00:00.000Z'),
        }),
      ).rejects.toThrow('invalid line range');

      const outOfBoundsRange = structuredClone(evidence);
      const outOfBoundsClaim = outOfBoundsRange.claims['ADRB-SEC-001'];
      if (!outOfBoundsClaim) throw new Error('Missing fixture claim');
      outOfBoundsClaim.references = ['repo:POLICIES/AI-SAFETY.md#L1-L9999'];
      await expect(
        assess(repository, benchmark, controls, 'planning', {
          agentEvidence: outOfBoundsRange,
          now: new Date('2026-07-17T12:00:00.000Z'),
        }),
      ).rejects.toThrow("references lines beyond POLICIES/AI-SAFETY.md's 2 lines");

      await expect(
        assess(repository, benchmark, controls, 'planning', {
          scope: 'workspace',
          agentEvidence: evidence,
          now: new Date('2026-07-17T12:00:00.000Z'),
        }),
      ).rejects.toThrow('repository-scoped agent evidence, which requires --scope tracked');

      await writeFile(join(repository, 'README.md'), 'Dirty fixture repository', 'utf8');
      await expect(
        assess(repository, benchmark, controls, 'planning', {
          agentEvidence: evidence,
          now: new Date('2026-07-17T12:00:00.000Z'),
        }),
      ).rejects.toThrow('requires tracked files to match');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });
});
