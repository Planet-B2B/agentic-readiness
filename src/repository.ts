import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import type { AssessmentScope } from './schema.js';

const execFileAsync = promisify(execFile);

export const generatedEvidenceIgnores = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/coverage/**',
  '**/.agentic/reports/**',
  '**/.agentic/report*.json',
  '**/.agentic/agentic-readiness*.json',
  '**/.agentic/agentic-readiness*.md',
  '**/.agentic/attestations.*',
  '**/.agentic/agent-evidence.*',
  '**/.agentic/evidence-request.*',
];

export interface RepositoryMetadata {
  root: string;
  scope: AssessmentScope;
  git_head: string | null;
  git_remote: string | null;
  working_tree_dirty: boolean | null;
  tracked_tree_dirty: boolean | null;
}

export interface RepositoryContext {
  metadata: RepositoryMetadata;
  includedPaths: Set<string> | null;
  excludedPaths: Set<string>;
}

function relativePathWithin(root: string, path: string): string | null {
  const candidate = relative(root, path);
  if (candidate === '') return candidate;
  if (candidate === '..' || candidate.startsWith(`..${sep}`) || isAbsolute(candidate)) {
    return null;
  }
  return candidate;
}

function normalizeExcludedPath(
  path: string,
  requestedRoot: string,
  canonicalRoot: string,
): string | null {
  const absolute = isAbsolute(path) ? resolve(path) : resolve(requestedRoot, path);
  return relativePathWithin(requestedRoot, absolute) ?? relativePathWithin(canonicalRoot, absolute);
}

function sanitizeRemote(remote: string | null): string | null {
  if (!remote) return null;
  try {
    const url = new URL(remote);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      url.username = '';
      url.password = '';
    } else if (url.password) {
      url.password = '';
    }
    return url.toString();
  } catch {
    return remote;
  }
}

async function git(repo: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      maxBuffer: 10_000_000,
    });
    return stdout;
  } catch {
    return null;
  }
}

export async function createRepositoryContext(
  repository: string,
  scope: AssessmentScope,
  excludedPaths: string[] = [],
): Promise<RepositoryContext> {
  const requestedRoot = resolve(repository);
  const root = await realpath(requestedRoot);
  const [headOutput, remoteOutput, statusOutput, trackedStatusOutput] = await Promise.all([
    git(root, ['rev-parse', 'HEAD']),
    git(root, ['config', '--get', 'remote.origin.url']),
    git(root, ['status', '--porcelain']),
    git(root, ['status', '--porcelain', '--untracked-files=no']),
  ]);

  let includedPaths: Set<string> | null = null;
  if (scope === 'tracked') {
    const tracked = await git(root, ['ls-files', '-z', '--cached']);
    if (tracked === null) {
      throw new Error(
        'Tracked assessment requires a Git worktree. Use --scope workspace for a provisional filesystem assessment.',
      );
    }
    includedPaths = new Set(tracked.split('\0').filter((path) => path.length > 0));
  }

  return {
    metadata: {
      root,
      scope,
      git_head: headOutput?.trim() || null,
      git_remote: sanitizeRemote(remoteOutput?.trim() || null),
      working_tree_dirty: statusOutput === null ? null : statusOutput.length > 0,
      tracked_tree_dirty: trackedStatusOutput === null ? null : trackedStatusOutput.length > 0,
    },
    includedPaths,
    excludedPaths: new Set(
      excludedPaths.flatMap((path) => {
        const normalized = normalizeExcludedPath(path, requestedRoot, root);
        return normalized === null ? [] : [normalized];
      }),
    ),
  };
}

export function repositoryEvidenceTarget(metadata: RepositoryMetadata): {
  repository: string;
  git_head: string | null;
} {
  return {
    repository: metadata.git_remote ?? metadata.root,
    git_head: metadata.git_head,
  };
}
