import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadAttestations, loadBenchmark } from '../src/load.js';
import { toMarkdown } from '../src/report.js';
import { assess } from '../src/score.js';
import type { AgentEvidenceFile } from '../src/schema.js';

const fixture = (name: string) => resolve(import.meta.dirname, 'fixtures', name);

describe('v0.2 assessment', () => {
  it('does not let a total score compensate for profile floors', async () => {
    const { benchmark, controls } = await loadBenchmark();
    const report = await assess(fixture('minimal'), benchmark, controls, 'pr-creation');
    expect(report.readiness.target_passed).toBe(false);
    expect(report.profiles.find(({ id }) => id === 'pr-creation')?.blockers.length).toBeGreaterThan(
      0,
    );
  });

  it('passes the level-three fixture with separately labelled attestations', async () => {
    const repo = fixture('mature');
    const { benchmark, controls } = await loadBenchmark();
    const attestations = await loadAttestations(
      resolve(repo, '.agentic', 'attestations.yaml'),
      benchmark.version,
    );
    const report = await assess(repo, benchmark, controls, 'limited-autonomous-maintenance', {
      attestations,
      now: new Date('2026-07-17T12:00:00Z'),
    });
    expect(report.score.total).toBe(30);
    expect(report.readiness.target_passed).toBe(true);
    expect(report.readiness.highest_profile).toBe('limited-autonomous-maintenance');
    expect(report.evidence_summary.attested).toBe(7);
  });

  it('ignores expired attestations', async () => {
    const repo = fixture('mature');
    const { benchmark, controls } = await loadBenchmark();
    const attestations = await loadAttestations(
      resolve(repo, '.agentic', 'attestations.yaml'),
      benchmark.version,
    );
    const report = await assess(repo, benchmark, controls, 'limited-autonomous-maintenance', {
      attestations,
      now: new Date('2028-01-01T00:00:00Z'),
    });
    expect(report.readiness.target_passed).toBe(false);
    expect(report.evidence_summary.attested).toBe(0);
  });

  it('keeps source snippets out of Markdown reports and separates unresolved scopes', async () => {
    const { benchmark, controls } = await loadBenchmark();
    const report = await assess(fixture('minimal'), benchmark, controls, 'planning');
    const markdown = toMarkdown(report);
    expect(markdown).toContain('Agentic Development Readiness Assessment');
    expect(markdown).toContain('Repository evidence gaps');
    expect(markdown).toContain('External controls not established');
    expect(markdown).toContain('Outcome evidence not established');
    expect(markdown).not.toContain('This fixture intentionally lacks');
  });

  it('is idempotent when its generated report is added to the workspace', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'adrb-assessment-'));
    const { benchmark, controls } = await loadBenchmark();
    try {
      await writeFile(join(repository, 'README.md'), 'minimal repository', 'utf8');
      const before = await assess(repository, benchmark, controls, 'planning', {
        scope: 'workspace',
        now: new Date('2026-07-17T12:00:00Z'),
      });
      await mkdir(join(repository, 'docs', 'agentic'), { recursive: true });
      await writeFile(
        join(repository, 'docs', 'agentic', 'assessment.md'),
        toMarkdown(before),
        'utf8',
      );
      const after = await assess(repository, benchmark, controls, 'planning', {
        scope: 'workspace',
        now: new Date('2026-07-17T12:00:00Z'),
      });
      expect(after.score).toEqual(before.score);
      expect(after.controls.map(({ status }) => status)).toEqual(
        before.controls.map(({ status }) => status),
      );
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('accepts target-bound agent evidence only for eligible external controls', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'adrb-assessment-'));
    const { benchmark, controls } = await loadBenchmark();
    try {
      execFileSync('git', ['-C', repository, 'init', '--quiet']);
      execFileSync('git', [
        '-C',
        repository,
        'remote',
        'add',
        'origin',
        'https://example.invalid/acme/repository.git',
      ]);
      await writeFile(join(repository, 'README.md'), 'tracked fixture', 'utf8');
      execFileSync('git', ['-C', repository, 'add', 'README.md']);
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
      const gitHead = execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim();
      const evidence: AgentEvidenceFile = {
        schema_version: '0.2.0',
        benchmark_version: '0.2.0',
        target: {
          repository: 'https://example.invalid/acme/repository.git',
          git_head: gitHead,
        },
        collector: { name: 'fixture-agent', version: '1.0.0' },
        claims: {
          'ADRB-GOV-003': {
            status: 'met',
            scope: 'platform',
            summary: 'Protected rules require review and status checks.',
            references: ['https://example.invalid/settings/rules/1'],
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
      const governance = report.controls.find(({ id }) => id === 'ADRB-GOV-003');
      expect(governance?.status).toBe('met');
      expect(governance?.confidence).toBe('agent-collected');

      const conflict = await assess(repository, benchmark, controls, 'planning', {
        agentEvidence: evidence,
        attestations: {
          benchmark_version: '0.2.0',
          attestations: {
            'ADRB-GOV-003': {
              status: 'not_met',
              evidence: 'https://example.invalid/review/finding',
              owner: 'Repository owner',
              reviewed_at: '2026-07-17',
              expires_at: '2026-08-17',
            },
          },
        },
        now: new Date('2026-07-17T12:00:00.000Z'),
      });
      expect(conflict.controls.find(({ id }) => id === 'ADRB-GOV-003')?.status).toBe('unknown');

      const unboundEvidence = structuredClone(evidence);
      unboundEvidence.target.git_head = null;
      await expect(
        assess(repository, benchmark, controls, 'planning', {
          agentEvidence: unboundEvidence,
          now: new Date('2026-07-17T12:00:00.000Z'),
        }),
      ).rejects.toThrow('Agent evidence commit unavailable does not match');

      const wrongRepository = structuredClone(evidence);
      wrongRepository.target.repository = 'https://example.invalid/other/repository.git';
      await expect(
        assess(repository, benchmark, controls, 'planning', {
          agentEvidence: wrongRepository,
          now: new Date('2026-07-17T12:00:00.000Z'),
        }),
      ).rejects.toThrow('Agent evidence target');

      const todoCollector = structuredClone(evidence);
      todoCollector.collector.name = 'TODO: collector';
      await expect(
        assess(repository, benchmark, controls, 'planning', {
          agentEvidence: todoCollector,
          now: new Date('2026-07-17T12:00:00.000Z'),
        }),
      ).rejects.toThrow('must identify the collector');

      const wrongScope = structuredClone(evidence);
      const wrongScopeClaim = wrongScope.claims['ADRB-GOV-003'];
      if (!wrongScopeClaim) throw new Error('Missing fixture claim');
      wrongScopeClaim.scope = 'organization';
      await expect(
        assess(repository, benchmark, controls, 'planning', {
          agentEvidence: wrongScope,
          now: new Date('2026-07-17T12:00:00.000Z'),
        }),
      ).rejects.toThrow('does not accept organization evidence');

      const futureClaim = structuredClone(evidence);
      const futureClaimValue = futureClaim.claims['ADRB-GOV-003'];
      if (!futureClaimValue) throw new Error('Missing fixture claim');
      futureClaimValue.collected_at = '2026-07-18T10:00:00.000Z';
      await expect(
        assess(repository, benchmark, controls, 'planning', {
          agentEvidence: futureClaim,
          now: new Date('2026-07-17T12:00:00.000Z'),
        }),
      ).rejects.toThrow('future collection timestamp');

      const expiredEvidence = structuredClone(evidence);
      const expiredClaim = expiredEvidence.claims['ADRB-GOV-003'];
      if (!expiredClaim) throw new Error('Missing fixture claim');
      expiredClaim.collected_at = '2026-07-15T10:00:00.000Z';
      expiredClaim.expires_at = '2026-07-16T10:00:00.000Z';
      const expiredReport = await assess(repository, benchmark, controls, 'planning', {
        agentEvidence: expiredEvidence,
        now: new Date('2026-07-17T12:00:00.000Z'),
      });
      const expiredGovernance = expiredReport.controls.find(({ id }) => id === 'ADRB-GOV-003');
      expect(expiredGovernance?.status).toBe('unknown');
      expect(expiredGovernance?.agent_evidence).toBeNull();
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });
});
