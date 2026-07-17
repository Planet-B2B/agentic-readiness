import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { evaluateControl } from '../src/evidence.js';
import { createRepositoryContext } from '../src/repository.js';
import { EvidenceCheckSchema, type Control } from '../src/schema.js';

const fixtureControl = (evidence: unknown[], overrides: Partial<Control> = {}): Control => ({
  id: 'ADRB-SEC-999',
  dimension: 'security',
  level: 1,
  title: 'Fixture',
  outcome: 'Fixture',
  risk: 'Fixture',
  evidence: evidence.map((check) => EvidenceCheckSchema.parse(check)),
  remediation: 'Fixture',
  references: [],
  allow_attestation: false,
  allow_not_applicable: false,
  allow_agent_evidence: false,
  ...overrides,
});

async function workspace(repository: string) {
  return createRepositoryContext(repository, 'workspace');
}

describe('v0.2 local evidence boundaries', () => {
  it('does not follow a repository symlink to content outside the assessment root', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'adrb-evidence-'));
    const repository = join(parent, 'repository');
    const secret = join(parent, 'outside.txt');
    const control = fixtureControl([
      {
        type: 'content_terms',
        files: ['LEAK.md'],
        terms: ['private-token'],
        min_terms: 1,
      },
    ]);

    try {
      await mkdir(repository);
      await writeFile(secret, 'private-token', 'utf8');
      await symlink(secret, join(repository, 'LEAK.md'));
      const result = await evaluateControl(await workspace(repository), control, null, null);
      expect(result.status).toBe('not_met');
      expect(result.evidence[0]?.references).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects an empty file as path evidence', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'adrb-evidence-'));
    const control = fixtureControl([{ type: 'path_any', patterns: ['CONTRIBUTING.md'] }]);
    try {
      await writeFile(join(repository, 'CONTRIBUTING.md'), '', 'utf8');
      const result = await evaluateControl(await workspace(repository), control, null, null);
      expect(result.status).toBe('not_met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('requires terms to be co-located and cites only qualifying files', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'adrb-evidence-'));
    const control = fixtureControl([
      {
        type: 'content_terms',
        files: ['*.md'],
        terms: ['rollback', 'recovery'],
        min_terms: 2,
      },
    ]);
    try {
      await writeFile(join(repository, 'A.md'), 'rollback', 'utf8');
      await writeFile(join(repository, 'B.md'), 'recovery', 'utf8');
      let result = await evaluateControl(await workspace(repository), control, null, null);
      expect(result.status).toBe('not_met');
      expect(result.evidence[0]?.references).toEqual([]);

      await writeFile(join(repository, 'RECOVERY.md'), 'rollback and recovery', 'utf8');
      result = await evaluateControl(await workspace(repository), control, null, null);
      expect(result.status).toBe('met');
      expect(result.evidence[0]?.references).toEqual(['RECOVERY.md']);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('requires agent-specific terms for guidance-integrity evidence', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'adrb-evidence-'));
    const control = fixtureControl([
      {
        type: 'content_terms',
        files: ['**/*'],
        terms: ['validate', 'lint', 'stale', 'broken link', 'integrity', 'check'],
        min_terms: 1,
        required_any_terms: ['agent docs', 'agent instructions', 'AGENTS.md'],
      },
    ]);
    try {
      await writeFile(
        join(repository, 'package.json'),
        JSON.stringify({ scripts: { lint: 'eslint .', validate: 'tool validate' } }),
        'utf8',
      );
      let result = await evaluateControl(await workspace(repository), control, null, null);
      expect(result.status).toBe('not_met');
      expect(result.evidence[0]?.references).toEqual([]);

      await writeFile(
        join(repository, 'verify.yml'),
        'name: Validate agent instructions\nrun: npm run agent-doc-check\n',
        'utf8',
      );
      result = await evaluateControl(await workspace(repository), control, null, null);
      expect(result.status).toBe('met');
      expect(result.evidence[0]?.references).toEqual(['verify.yml']);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('matches terms on word boundaries instead of inside unrelated words', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'adrb-evidence-'));
    const control = fixtureControl([
      {
        type: 'content_terms',
        files: ['README.md'],
        terms: ['test'],
        min_terms: 1,
      },
    ]);
    try {
      await writeFile(join(repository, 'README.md'), 'Human attestation is recorded.', 'utf8');
      const result = await evaluateControl(await workspace(repository), control, null, null);
      expect(result.status).toBe('not_met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('excludes untracked local configuration in tracked mode', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'adrb-evidence-'));
    const control = fixtureControl([{ type: 'path_any', patterns: ['.mcp.json'] }]);
    try {
      execFileSync('git', ['-C', repository, 'init', '--quiet']);
      await writeFile(join(repository, 'README.md'), 'tracked fixture', 'utf8');
      await writeFile(join(repository, '.mcp.json'), '{"tools":[]}', 'utf8');
      execFileSync('git', ['-C', repository, 'add', 'README.md']);

      const tracked = await evaluateControl(
        await createRepositoryContext(repository, 'tracked'),
        control,
        null,
        null,
      );
      const provisional = await evaluateControl(
        await createRepositoryContext(repository, 'workspace'),
        control,
        null,
        null,
      );
      expect(tracked.status).toBe('not_met');
      expect(provisional.status).toBe('met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('resolves relative exclusions from the assessed repository root', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'adrb-evidence-'));
    const control = fixtureControl([
      {
        type: 'content_terms',
        files: ['artifacts/**'],
        terms: ['generated-marker'],
        min_terms: 1,
      },
    ]);
    try {
      await mkdir(join(repository, 'artifacts'), { recursive: true });
      await writeFile(join(repository, 'artifacts', 'report.md'), 'generated-marker', 'utf8');
      const context = await createRepositoryContext(repository, 'workspace', [
        'artifacts/report.md',
      ]);
      const result = await evaluateControl(context, control, null, null);
      expect(context.excludedPaths).toEqual(new Set(['artifacts/report.md']));
      expect(result.status).toBe('not_met');
      expect(result.evidence[0]?.references).toEqual([]);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('normalizes absolute exclusions beneath a symlinked repository root', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'adrb-evidence-'));
    const repository = join(parent, 'repository');
    const linkedRepository = join(parent, 'linked-repository');
    const control = fixtureControl([
      {
        type: 'content_terms',
        files: ['artifacts/**'],
        terms: ['generated-marker'],
        min_terms: 1,
      },
    ]);
    try {
      await mkdir(join(repository, 'artifacts'), { recursive: true });
      await writeFile(join(repository, 'artifacts', 'report.md'), 'generated-marker', 'utf8');
      await symlink(repository, linkedRepository, 'dir');
      const context = await createRepositoryContext(linkedRepository, 'workspace', [
        join(linkedRepository, 'artifacts', 'report.md'),
      ]);
      const result = await evaluateControl(context, control, null, null);
      expect(context.excludedPaths).toEqual(new Set(['artifacts/report.md']));
      expect(result.status).toBe('not_met');
      expect(result.evidence[0]?.references).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('never uses generated reports as evidence, even in workspace mode', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'adrb-evidence-'));
    const control = fixtureControl([
      {
        type: 'content_terms',
        files: ['.agentic/**'],
        terms: ['task', 'harness', 'result'],
        min_terms: 3,
      },
    ]);
    try {
      await mkdir(join(repository, '.agentic', 'reports'), { recursive: true });
      await writeFile(
        join(repository, '.agentic', 'reports', 'agentic-readiness.md'),
        'task harness result',
        'utf8',
      );
      const result = await evaluateControl(await workspace(repository), control, null, null);
      expect(result.status).toBe('not_met');
      expect(result.evidence[0]?.references).toEqual([]);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('recognizes JSON assessment output outside the default report directory', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'adrb-evidence-'));
    const control = fixtureControl([
      {
        type: 'content_terms',
        files: ['artifacts/**'],
        terms: ['agentic-development-readiness', 'assessed_at', 'controls'],
        min_terms: 3,
      },
    ]);
    try {
      await mkdir(join(repository, 'artifacts'), { recursive: true });
      await writeFile(
        join(repository, 'artifacts', 'stale-report.json'),
        JSON.stringify({
          schema_version: '0.2.0',
          benchmark: { id: 'agentic-development-readiness', version: '0.2.0' },
          assessed_at: '2026-07-17T12:00:00.000Z',
          controls: [],
        }),
        'utf8',
      );
      const result = await evaluateControl(await workspace(repository), control, null, null);
      expect(result.status).toBe('not_met');
      expect(result.evidence[0]?.references).toEqual([]);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('keeps a human override visibly attested when repository evidence does not match', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'adrb-evidence-'));
    const control = fixtureControl([{ type: 'path_any', patterns: ['missing/**'] }], {
      allow_attestation: true,
    });
    try {
      const result = await evaluateControl(
        await workspace(repository),
        control,
        {
          benchmark_version: '0.2.0',
          attestations: {
            [control.id]: {
              status: 'met',
              evidence: 'https://example.invalid/nonstandard-evidence',
              owner: 'Fixture owner',
              reviewed_at: '2026-07-17',
              expires_at: '2026-10-17',
            },
          },
        },
        null,
      );
      expect(result.status).toBe('met');
      expect(result.confidence).toBe('attested');
      expect(result.evidence[0]?.status).toBe('not_met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });
});
