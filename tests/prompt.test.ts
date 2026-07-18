import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('recommended assessment prompt', () => {
  it('preserves the selected commit and persists artifacts outside temporary worktrees', async () => {
    const prompt = await readFile(resolve(import.meta.dirname, '..', 'AGENT_PROMPT.md'), 'utf8');
    const normalizedPrompt = prompt.replace(/\s+/g, ' ');

    expect(normalizedPrompt).toContain('a dirty checkout does not change that selection');
    expect(normalizedPrompt).toContain('preserve HEAD by default');
    expect(normalizedPrompt).toContain('Use the fetched upstream commit only when I asked');
    expect(normalizedPrompt).toContain('durable artifact directory outside any temporary worktree');
    expect(prompt).toContain('--output <artifact-dir>/agent-evidence.yaml');
    expect(prompt).toContain('--request-output <artifact-dir>/evidence-request.md');
    expect(prompt).toContain('--agent-evidence <artifact-dir>/agent-evidence.yaml');
    expect(normalizedPrompt).toContain('npm package and immutable ADRB benchmark are both');
    expect(normalizedPrompt).toContain('version 0.4.0');
  });
});
