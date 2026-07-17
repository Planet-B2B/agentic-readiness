import { describe, expect, it } from 'vitest';

import { loadBenchmark } from '../src/load.js';
import { dimensionIds } from '../src/schema.js';

describe('benchmark catalog', () => {
  it('has four maturity controls for every dimension', async () => {
    const { benchmark, controls } = await loadBenchmark();
    expect(benchmark.version).toBe('0.1.0');
    expect(controls).toHaveLength(40);
    for (const dimension of dimensionIds) {
      expect(
        controls.filter((control) => control.dimension === dimension).map(({ level }) => level),
      ).toEqual([1, 2, 3, 4]);
    }
  });
});
