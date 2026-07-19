import { readFileSync } from 'node:fs';

const lessons = readFileSync(new URL('../.ai/lessons.md', import.meta.url), 'utf8');
if (!lessons.includes('Lessons and corrections')) {
  throw new Error('The maintained lessons artifact is missing its required heading');
}

const headings = [...lessons.matchAll(/^##\s+(.+)$/gm)].map((match) =>
  (match[1] ?? '').trim().toLowerCase(),
);
const duplicateHeadings = headings.filter((heading, index) => headings.indexOf(heading) !== index);
if (duplicateHeadings.length > 0) {
  throw new Error(`Knowledge curation found duplicate lessons: ${duplicateHeadings.join(', ')}`);
}
if (/^status:\s*stale\b/im.test(lessons)) {
  throw new Error('Knowledge curation found a stale lesson that requires review');
}
