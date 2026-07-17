import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadAttestations, loadBenchmark } from '../src/load.js';
import { toMarkdown } from '../src/report.js';
import { assess } from '../src/score.js';

const fixture = (name: string) => resolve(import.meta.dirname, 'fixtures', name);

describe('assessment', () => {
  it('does not let a total score compensate for profile floors', async () => {
    const { benchmark, controls } = await loadBenchmark();
    const report = await assess(fixture('minimal'), benchmark, controls, 'pr-creation', null);
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
    const report = await assess(
      repo,
      benchmark,
      controls,
      'limited-autonomous-maintenance',
      attestations,
      new Date('2026-07-17T12:00:00Z'),
    );
    expect(report.score.total).toBe(30);
    expect(report.readiness.target_passed).toBe(true);
    expect(report.readiness.highest_profile).toBe('limited-autonomous-maintenance');
    expect(report.evidence_summary.attested).toBe(6);
  });

  it('ignores expired attestations', async () => {
    const repo = fixture('mature');
    const { benchmark, controls } = await loadBenchmark();
    const attestations = await loadAttestations(
      resolve(repo, '.agentic', 'attestations.yaml'),
      benchmark.version,
    );
    const report = await assess(
      repo,
      benchmark,
      controls,
      'limited-autonomous-maintenance',
      attestations,
      new Date('2028-01-01T00:00:00Z'),
    );
    expect(report.readiness.target_passed).toBe(false);
    expect(report.evidence_summary.attested).toBe(0);
  });

  it('keeps source snippets out of Markdown reports', async () => {
    const { benchmark, controls } = await loadBenchmark();
    const report = await assess(fixture('minimal'), benchmark, controls, 'planning', null);
    const markdown = toMarkdown(report);
    expect(markdown).toContain('Agentic Development Readiness Assessment');
    expect(markdown).not.toContain('This fixture intentionally lacks');
  });
});
