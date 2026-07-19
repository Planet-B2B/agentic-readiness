import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('executes the mature fixture verification path', () => {
  const guidance = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  expect(guidance).toContain('Scope and precedence');
});
