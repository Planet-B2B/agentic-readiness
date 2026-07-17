import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { evaluateControl } from '../src/evidence.js';
import type { Control } from '../src/schema.js';

const fixtureControl = (evidence: Control['evidence']): Control => ({
  id: 'ADRB-SEC-999',
  dimension: 'security',
  level: 1,
  title: 'Fixture',
  outcome: 'Fixture',
  risk: 'Fixture',
  evidence,
  remediation: 'Fixture',
  references: [],
  allow_attestation: true,
  allow_not_applicable: false,
});

describe('local evidence boundaries', () => {
  it('does not follow a repository symlink to content outside the assessment root', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'adrb-evidence-'));
    const repository = join(parent, 'repository');
    const secret = join(parent, 'outside.txt');
    const control = fixtureControl([
      { type: 'content_any', files: ['LEAK.md'], needles: ['private-token'] },
    ]);

    try {
      await mkdir(repository);
      await writeFile(secret, 'private-token', 'utf8');
      await symlink(secret, join(repository, 'LEAK.md'));
      const result = await evaluateControl(repository, control, null);
      expect(result.status).toBe('not_met');
      expect(result.evidence[0]?.references).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('requires every deterministic evidence check and labels the result verified', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'adrb-evidence-'));
    const control = fixtureControl([
      { type: 'path_all', patterns: ['AGENTS.md', 'README.md'] },
      { type: 'content_all', files: ['*.md'], needles: ['scope', 'architecture'] },
      { type: 'max_bytes', patterns: ['*.md'], max_bytes: 1_000 },
    ]);

    try {
      await writeFile(join(repository, 'AGENTS.md'), 'scope and architecture', 'utf8');
      await writeFile(join(repository, 'README.md'), 'fixture', 'utf8');
      const result = await evaluateControl(repository, control, null);
      expect(result.status).toBe('met');
      expect(result.confidence).toBe('verified');
      expect(result.evidence.every(({ status }) => status === 'met')).toBe(true);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('keeps an override visibly attested when local heuristics do not match', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'adrb-evidence-'));
    const control = fixtureControl([{ type: 'path_any', patterns: ['missing/**'] }]);

    try {
      const result = await evaluateControl(repository, control, {
        benchmark_version: '0.1.0',
        attestations: {
          [control.id]: {
            status: 'met',
            evidence: 'https://example.invalid/nonstandard-evidence',
            owner: 'Fixture owner',
            reviewed_at: '2026-07-17',
            expires_at: null,
          },
        },
      });
      expect(result.status).toBe('met');
      expect(result.confidence).toBe('attested');
      expect(result.evidence[0]?.status).toBe('not_met');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });
});
