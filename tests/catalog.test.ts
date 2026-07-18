import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import fg from 'fast-glob';

import { evaluateControl } from '../src/evidence.js';
import { loadAgentEvidence, loadAttestations, loadBenchmark } from '../src/load.js';
import { createRepositoryContext } from '../src/repository.js';
import { dimensionIds } from '../src/schema.js';

const benchmarkFixture = (version: string) =>
  resolve(import.meta.dirname, '..', 'benchmark', version);

describe('benchmark catalog', () => {
  it('has every maturity level and only scoped v0.3 evidence', async () => {
    const { benchmark, controls } = await loadBenchmark();
    expect(benchmark.version).toBe('0.3.0');
    expect(controls.length).toBeGreaterThan(40);
    for (const dimension of dimensionIds) {
      const levels = controls
        .filter((control) => control.dimension === dimension)
        .map(({ level }) => level);
      expect(new Set(levels)).toEqual(new Set([1, 2, 3, 4]));
    }
    expect(controls.flatMap(({ evidence }) => evidence).every(({ scope }) => Boolean(scope))).toBe(
      true,
    );
    expect(
      controls.some(
        ({ allow_agent_evidence: allowed, agent_evidence_scopes: scopes }) =>
          allowed && scopes.includes('repository'),
      ),
    ).toBe(true);
  });

  it('keeps vendor path aliases in detector adapters', async () => {
    const root = benchmarkFixture('v0.3');
    const controlPaths = await fg('controls/*.yaml', { cwd: root, absolute: true });
    const controlSource = (
      await Promise.all(controlPaths.map(async (path) => readFile(path, 'utf8')))
    ).join('\n');
    expect(controlSource).not.toMatch(/CLAUDE|\.claude|\.codex|\.cursor|opencode|copilot|\.kiro/);

    const { controls } = await loadBenchmark(root);
    const contextEntry = controls.find(({ id }) => id === 'ADRB-CTX-001');
    const pathCheck = contextEntry?.evidence.find(({ type }) => type === 'path_any');
    expect(pathCheck && 'patterns' in pathCheck ? pathCheck.patterns : []).toContain(
      '.cursor/skills/**',
    );
  });

  it('preserves v0.1 attestation defaults and non-expiring files', async () => {
    const { benchmark, controls } = await loadBenchmark(benchmarkFixture('v0.1'));
    expect(benchmark.version).toBe('0.1.0');
    expect(controls.every(({ allow_attestation: allowed }) => allowed)).toBe(true);

    const directory = await mkdtemp(join(tmpdir(), 'adrb-v01-attestation-'));
    const path = join(directory, 'attestations.yaml');
    try {
      await writeFile(
        path,
        [
          'benchmark_version: 0.1.0',
          'attestations:',
          '  ADRB-CTX-001:',
          '    status: met',
          '    evidence: https://example.invalid/evidence',
          '    owner: Fixture owner',
          '    reviewed_at: 2026-07-17',
          '',
        ].join('\n'),
        'utf8',
      );
      const attestations = await loadAttestations(path, benchmark.version);
      expect(attestations?.attestations['ADRB-CTX-001']?.expires_at).toBeNull();
      const control = controls.find(({ id }) => id === 'ADRB-CTX-001');
      if (!control) throw new Error('Missing v0.1 fixture control');
      const result = await evaluateControl(
        await createRepositoryContext(directory, 'workspace'),
        control,
        attestations,
        null,
      );
      expect(result.status).toBe('met');
      expect(result.confidence).toBe('attested');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('continues to require expiration for v0.2 attestations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'adrb-v02-attestation-'));
    const path = join(directory, 'attestations.yaml');
    try {
      await writeFile(
        path,
        [
          'benchmark_version: 0.2.0',
          'attestations:',
          '  ADRB-GOV-003:',
          '    status: met',
          '    evidence: https://example.invalid/evidence',
          '    owner: Fixture owner',
          '    reviewed_at: 2026-07-17',
          '',
        ].join('\n'),
        'utf8',
      );
      await expect(loadAttestations(path, '0.2.0')).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('requires v0.3 agent evidence to bind a non-null commit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'adrb-v03-agent-evidence-'));
    const path = join(directory, 'agent-evidence.yaml');
    try {
      await writeFile(
        path,
        [
          'schema_version: 0.3.0',
          'benchmark_version: 0.3.0',
          'target:',
          '  repository: https://example.invalid/acme/repository.git',
          '  git_head: null',
          'collector:',
          '  name: fixture',
          '  version: 1.0.0',
          'claims: {}',
          '',
        ].join('\n'),
        'utf8',
      );
      await expect(loadAgentEvidence(path, '0.3.0')).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
