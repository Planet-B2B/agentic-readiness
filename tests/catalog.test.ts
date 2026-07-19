import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import fg from 'fast-glob';

import { evaluateControl } from '../src/evidence.js';
import { loadAgentEvidence, loadAttestations, loadBenchmark } from '../src/load.js';
import { createRepositoryContext } from '../src/repository.js';
import { dimensionIds, EvidenceCheckSchema } from '../src/schema.js';

const benchmarkFixture = (version: string) =>
  resolve(import.meta.dirname, '..', 'benchmark', version);

describe('benchmark catalog', () => {
  it('has every maturity level and only scoped v0.4 evidence', async () => {
    const { benchmark, controls } = await loadBenchmark();
    expect(benchmark.version).toBe('0.4.0');
    expect(controls).toHaveLength(45);
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
    expect(() =>
      EvidenceCheckSchema.parse({
        type: 'manual',
        scope: 'repository',
        prompt: 'A repository claim must use deterministic or agent-collected evidence.',
      }),
    ).toThrow();
  });

  it('keeps vendor path aliases in detector adapters', async () => {
    const root = benchmarkFixture('v0.4');
    const controlPaths = await fg('controls/*.yaml', { cwd: root, absolute: true });
    const governanceControlSource = await readFile(
      join(root, 'controls', 'governance.yaml'),
      'utf8',
    );
    const securityControlSource = await readFile(join(root, 'controls', 'security.yaml'), 'utf8');
    const controlSource = (
      await Promise.all(controlPaths.map(async (path) => readFile(path, 'utf8')))
    ).join('\n');
    expect(controlSource).not.toMatch(
      /CLAUDE|\.claude|\.codex|\.cursor|opencode|copilot|\.kiro|gitleaks|trufflehog/,
    );

    const { controls } = await loadBenchmark(root);
    const contextEntry = controls.find(({ id }) => id === 'ADRB-CTX-001');
    const pathCheck = contextEntry?.evidence.find(({ type }) => type === 'path_any');
    expect(pathCheck && 'patterns' in pathCheck ? pathCheck.patterns : []).toContain(
      '.cursor/skills/**',
    );
    const securityAutomation = controls.find(({ id }) => id === 'ADRB-SEC-003');
    const commandCheck = securityAutomation?.evidence.find(({ type }) => type === 'ci_command');
    expect(commandCheck?.type === 'ci_command' ? commandCheck.tools : []).toContainEqual(
      expect.objectContaining({
        id: 'gitleaks',
        commands: [{ executables: ['gitleaks'], required_arguments: ['detect', 'protect'] }],
        standalone_executables: [],
        actions: ['gitleaks/gitleaks-action'],
      }),
    );
    expect(commandCheck?.type === 'ci_command' ? commandCheck.providers : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'github-actions',
          files: ['.github/workflows/*.yml', '.github/workflows/*.yaml'],
        }),
        expect.objectContaining({ id: 'gitlab-ci', files: ['.gitlab-ci.yml'] }),
        expect.objectContaining({
          id: 'azure-pipelines',
          files: ['azure-pipelines.yml', 'azure-pipelines.yaml'],
        }),
      ]),
    );
    expect(securityControlSource).not.toMatch(/\.github\/workflows|gitlab-ci|azure-pipelines/);
    const governanceOwnership = controls
      .find(({ id }) => id === 'ADRB-GOV-002')
      ?.evidence.find(({ type }) => type === 'ownership_map');
    expect(
      governanceOwnership?.type === 'ownership_map' ? governanceOwnership.patterns : [],
    ).toContain('.github/CODEOWNERS');
    expect(governanceControlSource).not.toContain('.github/CODEOWNERS');
    const guidanceIntegrity = controls.find(({ id }) => id === 'ADRB-CTX-003');
    const guidanceCheck = guidanceIntegrity?.evidence.find(({ type }) => type === 'ci_command');
    expect(guidanceCheck?.type === 'ci_command' ? guidanceCheck.tools : []).toContainEqual(
      expect.objectContaining({ id: 'agent-guidance-validation' }),
    );
    const ciVerification = controls.find(({ id }) => id === 'ADRB-TST-003');
    const ciCheck = ciVerification?.evidence.find(({ type }) => type === 'ci_command');
    const ciTools = ciCheck?.type === 'ci_command' ? ciCheck.tools : [];
    expect(ciTools.find(({ id }) => id === 'tests')?.standalone_executables).toContain('pytest');
    expect(ciTools.find(({ id }) => id === 'static-analysis')?.standalone_executables).toContain(
      'mypy',
    );
    const staticCommands = ciTools.find(({ id }) => id === 'static-analysis')?.commands ?? [];
    expect(staticCommands.find(({ executables }) => executables.includes('cargo'))).toEqual({
      executables: ['cargo'],
      required_arguments: ['clippy', 'check'],
    });
    expect(staticCommands.find(({ executables }) => executables.includes('go'))).toEqual({
      executables: ['go'],
      required_arguments: ['vet'],
    });
    expect(controlSource).not.toMatch(/pytest|mypy|flake8|ruff|pyright/);

    const specification = controls.find(({ id }) => id === 'ADRB-SPC-001');
    const specificationPath = specification?.evidence.find(({ type }) => type === 'path_any');
    expect(specificationPath?.type === 'path_any' ? specificationPath.patterns : []).toContain(
      'docs/spec*.md',
    );
  });

  it('keeps the immutable v0.3 catalog unchanged', async () => {
    const { benchmark, controls } = await loadBenchmark(benchmarkFixture('v0.3'));
    expect(benchmark.version).toBe('0.3.0');
    expect(controls).toHaveLength(44);
    expect(controls.some(({ id }) => id === 'ADRB-SEC-007')).toBe(false);
    expect(controls.find(({ id }) => id === 'ADRB-RES-002')?.evidence[0]?.type).toBe(
      'content_terms',
    );
    expect(controls.find(({ id }) => id === 'ADRB-GOV-002')?.evidence[0]?.type).toBe('path_any');
    expect(controls.find(({ id }) => id === 'ADRB-SEC-003')?.evidence[0]?.type).toBe(
      'content_terms',
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

  it('skips version-mismatched auto-loaded artifacts with migration warnings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'adrb-v04-migration-'));
    const attestationPath = join(directory, 'attestations.yaml');
    const evidencePath = join(directory, 'agent-evidence.yaml');
    const warnings: string[] = [];
    const options = {
      ignoreVersionMismatch: true,
      onWarning: (warning: string) => warnings.push(warning),
    };
    try {
      await writeFile(attestationPath, 'benchmark_version: 0.3.0\nattestations: {}\n', 'utf8');
      await writeFile(
        evidencePath,
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

      await expect(loadAttestations(attestationPath, '0.4.0', options)).resolves.toBeNull();
      await expect(loadAgentEvidence(evidencePath, '0.4.0', options)).resolves.toBeNull();
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain('Ignored auto-loaded attestation file');
      expect(warnings[1]).toContain('agentic-scorecard init-evidence --force');

      await expect(loadAttestations(attestationPath, '0.4.0')).rejects.toThrow(
        'targets ADRB v0.3.0, not v0.4.0',
      );
      await expect(loadAgentEvidence(evidencePath, '0.4.0')).rejects.toThrow(
        'targets ADRB v0.3.0, not v0.4.0',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('requires v0.4 agent evidence to bind a non-null commit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'adrb-v04-agent-evidence-'));
    const path = join(directory, 'agent-evidence.yaml');
    try {
      await writeFile(
        path,
        [
          'schema_version: 0.4.0',
          'benchmark_version: 0.4.0',
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
      await expect(loadAgentEvidence(path, '0.4.0')).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps the published repository-reference grammar aligned with runtime validation', async () => {
    const schema = JSON.parse(
      await readFile(resolve(benchmarkFixture('v0.4'), 'agent-evidence-schema.json'), 'utf8'),
    ) as {
      properties?: {
        claims?: {
          additionalProperties?: {
            allOf?: Array<{
              then?: {
                properties?: {
                  references?: { items?: { pattern?: string } };
                };
              };
            }>;
          };
        };
      };
    };
    const pattern =
      schema.properties?.claims?.additionalProperties?.allOf?.[0]?.then?.properties?.references
        ?.items?.pattern;
    expect(pattern).toBeDefined();
    const reference = new RegExp(pattern ?? '');

    for (const valid of [
      'repo:README.md',
      'repo:docs/security/policy.md#L1',
      'repo:docs/security/policy.md#L1-L2',
    ]) {
      expect(reference.test(valid), valid).toBe(true);
    }
    for (const invalid of [
      'repo:/README.md',
      'repo:../README.md',
      'repo:./README.md',
      'repo:docs/../README.md',
      'repo:docs/./README.md',
      'repo:docs\\security.md',
      'repo:README.md#fragment',
      'repo:README.md#L0',
    ]) {
      expect(reference.test(invalid), invalid).toBe(false);
    }
  });

  it('uses an unmistakable unbound commit placeholder in the static evidence template', async () => {
    const template = await readFile(
      resolve(import.meta.dirname, '..', 'templates', 'agent-evidence.yaml'),
      'utf8',
    );
    expect(template).toContain("git_head: 'TODO: generated by init-evidence'");
    expect(template).not.toContain('0000000000000000000000000000000000000000');
  });
});
