import { readFileSync } from 'node:fs';

const lessons = readFileSync(new URL('../.ai/lessons.md', import.meta.url), 'utf8');
if (!lessons.includes('Lessons and corrections')) {
  throw new Error('The maintained lessons artifact is missing its required heading');
}
