import { readFileSync } from 'node:fs';

const specification = readFileSync(new URL('../specs/example.md', import.meta.url), 'utf8');
if (!specification.includes('Acceptance criteria')) {
  throw new Error('The specification is missing acceptance criteria');
}
