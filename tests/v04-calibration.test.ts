import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadBenchmark } from '../src/load.js';
import { assess } from '../src/score.js';

const v04Root = resolve(import.meta.dirname, '..', 'benchmark', 'v0.4');

async function gitFixture(files: Record<string, string>): Promise<string> {
  const repository = await mkdtemp(join(tmpdir(), 'adrb-v04-'));
  execFileSync('git', ['-C', repository, 'init', '--quiet']);
  execFileSync('git', [
    '-C',
    repository,
    'remote',
    'add',
    'origin',
    'https://example.invalid/acme/repository.git',
  ]);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(repository, path)), { recursive: true });
    await writeFile(join(repository, path), contents, 'utf8');
  }
  execFileSync('git', ['-C', repository, 'add', '.']);
  execFileSync('git', [
    '-C',
    repository,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  ]);
  return repository;
}

function controlStatus(report: Awaited<ReturnType<typeof assess>>, id: string) {
  return report.controls.find((control) => control.id === id);
}

describe('v0.4 evidence calibration', () => {
  it('reports semantic containment coverage without promoting a partial match', async () => {
    const repository = await gitFixture({
      'AGENTS.md': [
        '# Agent boundaries',
        'Edit only allowed paths. If requested work leaves those paths, stop and ask the coordinator.',
        'A human approval is required before work can continue.',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const resilience = controlStatus(report, 'ADRB-RES-002');

      expect(resilience?.status).toBe('not_met');
      expect(resilience?.evidence[0]?.summary).toContain('semantic coverage 3/5');
      expect(resilience?.evidence[0]?.summary).toContain(
        'matched: mutation-scope, stop-trigger, escalation',
      );
      expect(resilience?.evidence[0]?.summary).toContain(
        'missing: resource-or-retry-bounds, recovery-ownership',
      );
      expect(resilience?.evidence[0]?.references).toContain('AGENTS.md');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('accepts complete containment guidance without requiring v0.3 idioms', async () => {
    const repository = await gitFixture({
      'AGENTS.md': [
        '# Agent boundaries',
        'Edit only allowed paths and respect the task time and tool-call budget.',
        'If the request crosses that boundary, halt work and escalate to the coordinator.',
        'The rollback owner is accountable for restoring affected state.',
      ].join('\n'),
    });
    try {
      const { benchmark, controls } = await loadBenchmark(v04Root);
      const report = await assess(repository, benchmark, controls, 'pr-creation');
      const resilience = controlStatus(report, 'ADRB-RES-002');

      expect(resilience?.status).toBe('met');
      expect(resilience?.confidence).toBe('repository-detected');
      expect(resilience?.evidence[0]?.summary).toContain('semantic coverage 5/5');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });
});
