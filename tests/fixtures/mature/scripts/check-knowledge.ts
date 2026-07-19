import { readFileSync } from 'node:fs';

const lessons = readFileSync(new URL('../.ai/lessons.md', import.meta.url), 'utf8');
if (!lessons.includes('Lessons and corrections')) {
  throw new Error('The maintained lessons artifact is missing its required heading');
}

const lines = lessons.split(/\r?\n/);
const headings = lines
  .filter((line) => line.startsWith('## '))
  .map((line) => line.slice(3).trim().toLowerCase());
const duplicateHeadings = headings.filter((heading, index) => headings.indexOf(heading) !== index);
if (duplicateHeadings.length > 0) {
  throw new Error(`Knowledge curation found duplicate lessons: ${duplicateHeadings.join(', ')}`);
}
const hasStaleLesson = lines.some((line) => {
  const normalized = line.trim().toLowerCase();
  if (!normalized.startsWith('status:')) return false;
  const status = normalized.slice('status:'.length).trim();
  return status === 'stale' || status.startsWith('stale ');
});
if (hasStaleLesson) {
  throw new Error('Knowledge curation found a stale lesson that requires review');
}
