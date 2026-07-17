import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import { parse } from 'yaml';

import {
  AttestationFileSchema,
  BenchmarkSchema,
  ControlFileSchema,
  dimensionIds,
  type AttestationFile,
  type Benchmark,
  type Control,
} from './schema.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const defaultBenchmarkRoot = join(packageRoot, 'benchmark', 'v0.1');

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
    const file = ControlFileSchema.parse(await readYaml(path));
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
    const file = AttestationFileSchema.parse(await readYaml(path));
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

export function validateCatalog(benchmark: Benchmark, controls: Control[]): void {
  const ids = new Set<string>();
  for (const control of controls) {
    if (ids.has(control.id)) throw new Error(`Duplicate control id: ${control.id}`);
    ids.add(control.id);
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
