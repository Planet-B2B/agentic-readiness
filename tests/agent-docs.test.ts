import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { assertRepositoryLocalTarget } from '../scripts/check-agent-docs.js';

describe('agent-document link integrity', () => {
  it('accepts repository files but rejects absolute, traversing, and escaping symlink targets', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'agent-doc-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'agent-doc-outside-'));
    const insidePath = join(repository, 'inside.md');
    const outsidePath = join(outside, 'outside.md');
    const symlinkPath = join(repository, 'escape.md');
    await writeFile(insidePath, '# Inside\n', 'utf8');
    await writeFile(outsidePath, '# Outside\n', 'utf8');
    await symlink(outsidePath, symlinkPath);
    try {
      await expect(assertRepositoryLocalTarget(repository, 'inside.md')).resolves.toBeUndefined();
      await expect(assertRepositoryLocalTarget(repository, outsidePath)).rejects.toThrow(
        'escapes the repository',
      );
      await expect(
        assertRepositoryLocalTarget(repository, relative(repository, outsidePath)),
      ).rejects.toThrow('escapes the repository');
      await expect(assertRepositoryLocalTarget(repository, 'escape.md')).rejects.toThrow(
        'escapes the repository',
      );
      await expect(assertRepositoryLocalTarget(repository, 'missing.md')).rejects.toThrow(
        'link target does not exist: missing.md',
      );
    } finally {
      await rm(repository, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
