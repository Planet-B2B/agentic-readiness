import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const guidance = readFileSync(resolve(__dirname, '..', 'AGENTS.md'), 'utf8');
if (!guidance.includes('Scope and precedence')) {
  throw new Error('AGENTS.md is missing the required precedence guidance');
}
