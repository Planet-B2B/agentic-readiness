import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = ['.ai/constitution.md', '.agents/skills/benchmark-authoring/SKILL.md'];

export async function assertRepositoryLocalTarget(repositoryRoot: string, target: string) {
  const canonicalRoot = await realpath(repositoryRoot);
  let canonicalTarget: string;
  try {
    canonicalTarget = await realpath(resolve(repositoryRoot, target));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Agent-document link target does not exist: ${target}`);
    }
    throw error;
  }
  const repositoryRelative = relative(canonicalRoot, canonicalTarget);
  if (
    repositoryRelative === '..' ||
    repositoryRelative.startsWith(`..${sep}`) ||
    isAbsolute(repositoryRelative)
  ) {
    throw new Error(`Agent-document link escapes the repository: ${target}`);
  }
}

async function checkAgentDocs(): Promise<void> {
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
    await assertRepositoryLocalTarget(root, target);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkAgentDocs();
}
