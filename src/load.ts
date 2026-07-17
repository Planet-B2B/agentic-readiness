import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import { parse } from 'yaml';

import {
  AgentEvidenceFileSchema,
  AttestationFileSchema,
  BenchmarkSchema,
  ControlFileSchema,
  LegacyAttestationFileSchema,
  LegacyControlFileSchema,
  dimensionIds,
  type AgentEvidenceFile,
  type AttestationFile,
  type Benchmark,
  type Control,
} from './schema.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const defaultBenchmarkRoot = join(packageRoot, 'benchmark', 'v0.2');

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

  validateCatalog(benchmark, controls);
  return { benchmark, controls };
}

export async function loadAttestations(
  path: string,
  benchmarkVersion: string,
): Promise<AttestationFile | null> {
  try {
    const rawFile = await readYaml(path);
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

export async function loadAgentEvidence(path: string): Promise<AgentEvidenceFile | null> {
  try {
    return AgentEvidenceFileSchema.parse(await readYaml(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function validateCatalog(benchmark: Benchmark, controls: Control[]): void {
  const ids = new Set<string>();
  for (const control of controls) {
    if (ids.has(control.id)) throw new Error(`Duplicate control id: ${control.id}`);
    ids.add(control.id);
    if (
      benchmark.version === '0.2.0' &&
      control.evidence.some(({ type }) => type === 'content_any' || type === 'content_all')
    ) {
      throw new Error(`${control.id} uses a legacy broad content collector in benchmark v0.2.0`);
    }
    if (control.allow_agent_evidence && !control.evidence.some(({ type }) => type === 'manual')) {
      throw new Error(`${control.id} allows agent evidence without an external evidence check`);
    }
    if (
      benchmark.version === '0.2.0' &&
      control.allow_attestation &&
      !control.evidence.some(({ type }) => type === 'manual')
    ) {
      throw new Error(`${control.id} allows attestation for repository-detected evidence`);
    }
    for (const check of control.evidence) {
      if (check.type === 'content_terms' && check.min_terms > check.terms.length) {
        throw new Error(`${control.id} requires more content terms than it defines`);
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
