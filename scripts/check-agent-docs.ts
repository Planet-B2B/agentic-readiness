import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = ['.ai/constitution.md', '.agents/skills/benchmark-authoring/SKILL.md'];

const agents = await readFile(resolve(root, 'AGENTS.md'), 'utf8');
if (agents.trim().length === 0) throw new Error('AGENTS.md must not be empty');
await Promise.all(
  requiredFiles.map(async (path) => {
    const text = await readFile(resolve(root, path), 'utf8');
    if (text.trim().length === 0) throw new Error(`${path} must not be empty`);
  }),
);
for (const heading of ['## Orientation', '## Non-negotiables', '## Verification']) {
  if (!agents.includes(heading)) throw new Error(`AGENTS.md is missing ${heading}`);
}

for (const match of agents.matchAll(/\]\(([^)]+)\)/g)) {
  const target = (match[1] ?? '').replace(/^<|>$/g, '').split('#', 1)[0] ?? '';
  if (!target || /^(?:https?:|mailto:|#)/i.test(target)) continue;
  await access(resolve(root, target));
}
