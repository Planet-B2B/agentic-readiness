import { readFileSync } from 'node:fs';

const guidance = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
if (!guidance.includes('Scope and precedence')) {
  throw new Error('AGENTS.md is missing the required precedence guidance');
}
