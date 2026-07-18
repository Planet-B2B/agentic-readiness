import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import { parse } from 'yaml';

import {
  AgentEvidenceFileSchema,
  AgentEvidenceFileV03Schema,
  AttestationFileSchema,
  BenchmarkSchema,
  ControlFileSchema,
  DetectorAdapterSchema,
  LegacyAttestationFileSchema,
  LegacyControlFileSchema,
  dimensionIds,
  type AgentEvidenceFile,
  type AttestationFile,
  type Benchmark,
  type Control,
  type DetectorAdapter,
} from './schema.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const defaultBenchmarkRoot = join(packageRoot, 'benchmark', 'v0.3');

export interface ArtifactLoadOptions {
  ignoreVersionMismatch?: boolean;
  onWarning?: (warning: string) => void;
}

async function readYaml(path: string): Promise<unknown> {
  return parse(await readFile(path, 'utf8')) as unknown;
}

export async function loadBenchmark(root = defaultBenchmarkRoot): Promise<{
  benchmark: Benchmark;
  controls: Control[];
}> {
  const benchmark = BenchmarkSchema.parse(await readYaml(join(root, 'benchmark.yaml')));
  const controlPaths = await fg('controls/*.yaml', { cwd: root, absolute: true, onlyFiles: true });
  const controls: Control[] = [];

  for (const path of controlPaths.sort()) {
    const file =
      benchmark.version === '0.1.0'
        ? LegacyControlFileSchema.parse(await readYaml(path))
        : ControlFileSchema.parse(await readYaml(path));
    controls.push(...file.controls.map((control) => ({ ...control, dimension: file.dimension })));
  }

  const adapterPaths = await fg('adapters/*.yaml', {
    cwd: root,
    absolute: true,
    onlyFiles: true,
  });
  for (const path of adapterPaths.sort()) {
    const adapter = DetectorAdapterSchema.parse(await readYaml(path));
    applyDetectorAdapter(benchmark, controls, adapter);
  }

  validateCatalog(benchmark, controls);
  return { benchmark, controls };
}

function applyDetectorAdapter(
  benchmark: Benchmark,
  controls: Control[],
  adapter: DetectorAdapter,
): void {
  if (adapter.benchmark_version !== benchmark.version) {
    throw new Error(
      `Detector adapter ${adapter.id} targets ${adapter.benchmark_version}, not ${benchmark.version}`,
    );
  }
  for (const extension of adapter.extensions) {
    const control = controls.find(({ id }) => id === extension.control_id);
    if (!control) {
      throw new Error(`Detector adapter ${adapter.id} references unknown ${extension.control_id}`);
    }
    const check = control.evidence[extension.evidence_index];
    if (!check) {
      throw new Error(
        `Detector adapter ${adapter.id} references missing evidence index ${extension.evidence_index} on ${control.id}`,
      );
    }
    if (extension.patterns) {
      if (!('patterns' in check)) {
        throw new Error(
          `Detector adapter ${adapter.id} cannot add patterns to ${control.id} evidence ${extension.evidence_index}`,
        );
      }
      check.patterns = [...new Set([...check.patterns, ...extension.patterns])];
    }
    if (extension.files) {
      if (!('files' in check)) {
        throw new Error(
          `Detector adapter ${adapter.id} cannot add files to ${control.id} evidence ${extension.evidence_index}`,
        );
      }
      check.files = [...new Set([...check.files, ...extension.files])];
    }
    if (extension.terms) {
      if (check.type !== 'content_terms' && check.type !== 'ci_command') {
        throw new Error(
          `Detector adapter ${adapter.id} cannot add terms to ${control.id} evidence ${extension.evidence_index}`,
        );
      }
      check.terms = [...new Set([...check.terms, ...extension.terms])];
    }
    if (extension.required_any_terms) {
      if (check.type !== 'content_terms') {
        throw new Error(
          `Detector adapter ${adapter.id} cannot add required terms to ${control.id} evidence ${extension.evidence_index}`,
        );
      }
      check.required_any_terms = [
        ...new Set([...(check.required_any_terms ?? []), ...extension.required_any_terms]),
      ];
    }
  }
}

export async function loadAttestations(
  path: string,
  benchmarkVersion: string,
  options: ArtifactLoadOptions = {},
): Promise<AttestationFile | null> {
  try {
    const rawFile = await readYaml(path);
    const artifactVersion = versionField(rawFile, 'benchmark_version');
    if (
      artifactVersion &&
      handleVersionMismatch(
        'Attestation',
        path,
        artifactVersion,
        benchmarkVersion,
        'init --force',
        options,
      )
    ) {
      return null;
    }
    const file =
      benchmarkVersion === '0.1.0'
        ? LegacyAttestationFileSchema.parse(rawFile)
        : AttestationFileSchema.parse(rawFile);
    if (file.benchmark_version !== benchmarkVersion) {
      throw new Error(
        `Attestation benchmark version ${file.benchmark_version} does not match ${benchmarkVersion}`,
      );
    }
    return file;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function loadAgentEvidence(
  path: string,
  benchmarkVersion: string,
  options: ArtifactLoadOptions = {},
): Promise<AgentEvidenceFile | null> {
  try {
    const rawFile = await readYaml(path);
    const artifactVersion = versionField(rawFile, 'benchmark_version');
    const schemaVersion = versionField(rawFile, 'schema_version');
    const mismatchedVersion = [artifactVersion, schemaVersion].find(
      (version) => version && version !== benchmarkVersion,
    );
    if (
      mismatchedVersion &&
      handleVersionMismatch(
        'Agent evidence',
        path,
        mismatchedVersion,
        benchmarkVersion,
        'init-evidence --force',
        options,
      )
    ) {
      return null;
    }
    const file = (() => {
      if (benchmarkVersion === '0.2.0') return AgentEvidenceFileSchema.parse(rawFile);
      if (benchmarkVersion === '0.3.0') return AgentEvidenceFileV03Schema.parse(rawFile);
      throw new Error(`Agent evidence bundles are unsupported for benchmark ${benchmarkVersion}`);
    })();
    if (file.benchmark_version !== benchmarkVersion) {
      throw new Error(
        `Agent evidence benchmark version ${file.benchmark_version} does not match ${benchmarkVersion}`,
      );
    }
    return file;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function versionField(value: unknown, field: string): string | null {
  if (!value || typeof value !== 'object' || !(field in value)) return null;
  const version = (value as Record<string, unknown>)[field];
  return typeof version === 'string' ? version : null;
}

function handleVersionMismatch(
  label: string,
  path: string,
  artifactVersion: string,
  benchmarkVersion: string,
  regenerateCommand: string,
  options: ArtifactLoadOptions,
): boolean {
  if (artifactVersion === benchmarkVersion) return false;
  const mismatch = `${label} file ${path} targets ADRB v${artifactVersion}, not v${benchmarkVersion}`;
  if (!options.ignoreVersionMismatch) {
    throw new Error(
      `${mismatch}. Regenerate it with \`agentic-scorecard ${regenerateCommand}\` or pass a v${benchmarkVersion} file.`,
    );
  }
  options.onWarning?.(
    `Ignored auto-loaded ${label.toLowerCase()} file ${path} because it targets ADRB v${artifactVersion}, not v${benchmarkVersion}. Regenerate it with \`agentic-scorecard ${regenerateCommand}\` before relying on its claims.`,
  );
  return true;
}

export function validateCatalog(benchmark: Benchmark, controls: Control[]): void {
  const ids = new Set<string>();
  for (const control of controls) {
    if (ids.has(control.id)) throw new Error(`Duplicate control id: ${control.id}`);
    ids.add(control.id);
    if (
      ['0.2.0', '0.3.0'].includes(benchmark.version) &&
      control.evidence.some(({ type }) => type === 'content_any' || type === 'content_all')
    ) {
      throw new Error(
        `${control.id} uses a legacy broad content collector in benchmark ${benchmark.version}`,
      );
    }
    const manualScopes = control.evidence
      .filter(({ type }) => type === 'manual')
      .map(({ scope }) => scope);
    const allowedAgentScopes =
      control.agent_evidence_scopes.length > 0 ? control.agent_evidence_scopes : manualScopes;
    if (control.allow_agent_evidence && allowedAgentScopes.length === 0) {
      throw new Error(`${control.id} allows agent evidence without an eligible evidence scope`);
    }
    if (!control.allow_agent_evidence && control.agent_evidence_scopes.length > 0) {
      throw new Error(`${control.id} declares agent evidence scopes but does not allow it`);
    }
    if (
      benchmark.version === '0.2.0' &&
      control.agent_evidence_scopes.some((scope) => scope === 'repository')
    ) {
      throw new Error(`${control.id} changes immutable v0.2 repository evidence semantics`);
    }
    if (
      ['0.2.0', '0.3.0'].includes(benchmark.version) &&
      control.allow_attestation &&
      !control.evidence.some(({ type }) => type === 'manual')
    ) {
      throw new Error(`${control.id} allows attestation for repository-detected evidence`);
    }
    for (const check of control.evidence) {
      if (check.type === 'content_terms' && check.min_terms > check.terms.length) {
        throw new Error(`${control.id} requires more content terms than it defines`);
      }
      if (check.type === 'ci_command' && check.min_terms > check.terms.length) {
        throw new Error(`${control.id} requires more CI command terms than it defines`);
      }
      if (check.type === 'content_groups') {
        const groupIds = check.groups.map(({ id }) => id);
        if (new Set(groupIds).size !== groupIds.length) {
          throw new Error(`${control.id} defines duplicate semantic evidence groups`);
        }
        if (check.min_groups > check.groups.length) {
          throw new Error(`${control.id} requires more semantic groups than it defines`);
        }
      }
    }
  }

  const benchmarkDimensions = benchmark.dimensions.map(({ id }) => id);
  if (benchmarkDimensions.join(',') !== dimensionIds.join(',')) {
    throw new Error('Benchmark dimensions must use the canonical order and complete dimension set');
  }

  for (const dimension of dimensionIds) {
    for (const level of [1, 2, 3, 4] as const) {
      const count = controls.filter(
        (control) => control.dimension === dimension && control.level === level,
      ).length;
      if (count === 0) throw new Error(`Dimension ${dimension} has no level ${level} control`);
    }
  }
}
