import { describe, expect, it } from 'vitest';

import { loadBenchmark } from '../src/load.js';
import { dimensionIds } from '../src/schema.js';

describe('benchmark catalog', () => {
  it('has every maturity level and only scoped v0.2 evidence', async () => {
    const { benchmark, controls } = await loadBenchmark();
    expect(benchmark.version).toBe('0.2.0');
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
  });
});
