import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import fg from 'fast-glob';
import { parse } from 'yaml';

import { generatedEvidenceIgnores, type RepositoryContext } from './repository.js';
import type {
  AgentEvidenceClaim,
  Attestation,
  AttestationFile,
  Control,
  ControlResult,
  EvidenceCheck,
  EvidenceResult,
  EvidenceScope,
} from './schema.js';

const maxContentFileBytes = 512_000;
const maxContentFiles = 250;
const maxContentTotalBytes = 5_000_000;
const namedOwnerRolePattern = /^(.{2,80})\s+(?:team|owners?|reviewers?|maintainers?)$/i;
const ownerRoleAssignmentPattern = /^(?:owner|reviewer|maintainer|team)\s*[:=-]\s*(.{2,80})$/i;
const repositoryWideOwnershipTargets = new Set([
  'all files',
  'default',
  'entire repository',
  'global',
  'repo',
  'repository',
  'root',
]);
const namedOwnershipTargetPrefixes = new Set(['area', 'component', 'module', 'path', 'scope']);
const placeholderOwnerValues = new Set([
  'tbd',
  'to be assigned',
  'to be determined',
  'not assigned',
  'unassigned',
  'n/a',
  'na',
  'not applicable',
  'none',
  'no owner',
  'no owners',
  'no designated owner',
  'no designated owners',
  'without owner',
  'without owners',
  'without a owner',
  'without an owner',
  'without a owners',
  'without an owners',
  'nobody',
  'unknown',
  'pending',
  'vacant',
]);
const semanticPlaceholderQualifiers = [
  'n/a',
  'none',
  'pending',
  'tbd',
  'to be assigned',
  'to be determined',
  'unassigned',
  'unknown',
  'vacant',
];
const supportedGitlabRuleKeys = new Set(['allow_failure', 'if', 'when']);
const gitlabReservedKeys = new Set([
  'after_script',
  'before_script',
  'cache',
  'default',
  'image',
  'include',
  'services',
  'stages',
  'variables',
  'workflow',
]);
const nonExecutingCommandArguments = new Set([
  '--co',
  '--collect-only',
  '--help',
  '--list',
  '--list-tests',
  '--listtests',
  '--print-config',
  '--showconfig',
  '--version',
  '-h',
  '-list',
  'help',
  'list',
  'version',
]);
const packageContextOptions = new Set([
  '--cwd',
  '--dir',
  '--filter',
  '--prefix',
  '--workspace',
  '-c',
  '-w',
]);
const packageGlobalOptionsWithValues = new Set([
  '--cache',
  '--cafile',
  '--color',
  '--config',
  '--https-proxy',
  '--key',
  '--location',
  '--loglevel',
  '--otp',
  '--proxy',
  '--registry',
  '--scope',
  '--tag',
  '--userconfig',
]);
const npmImplicitScripts = new Map([
  ['restart', 'restart'],
  ['start', 'start'],
  ['stop', 'stop'],
  ['t', 'test'],
  ['test', 'test'],
  ['tst', 'test'],
]);
const packageManagerDirectToolCommands = new Map([
  ['bun', new Set(['install'])],
  ['npm', new Set(['ci'])],
  ['pnpm', new Set(['install'])],
  ['yarn', new Set(['install'])],
]);
const matchCache = new WeakMap<RepositoryContext, Map<string, Promise<string[]>>>();
const searchableFileCache = new WeakMap<
  RepositoryContext,
  Map<string, Promise<Array<{ path: string; text: string }>>>
>();

async function matches(context: RepositoryContext, patterns: string[]): Promise<string[]> {
  const cache = matchCache.get(context) ?? new Map<string, Promise<string[]>>();
  matchCache.set(context, cache);
  const key = JSON.stringify(patterns);
  const cached = cache.get(key);
  if (cached) return cached;
  const scan = fg(patterns, {
    cwd: context.metadata.root,
    dot: true,
    onlyFiles: true,
    unique: true,
    followSymbolicLinks: false,
    ignore: generatedEvidenceIgnores,
  }).then((found) =>
    found
      .filter((path) => context.includedPaths === null || context.includedPaths.has(path))
      .filter((path) => !context.excludedPaths.has(path))
      .sort(),
  );
  cache.set(key, scan);
  return scan;
}

async function safeFileSize(root: string, path: string): Promise<number | null> {
  try {
    const requestedPath = resolve(root, path);
    if ((await lstat(requestedPath)).isSymbolicLink()) return null;
    const canonicalPath = await realpath(requestedPath);
    if (canonicalPath !== root && !canonicalPath.startsWith(`${root}${sep}`)) return null;
    const metadata = await stat(canonicalPath);
    return metadata.isFile() ? metadata.size : null;
  } catch {
    return null;
  }
}

async function nonEmptyMatches(
  context: RepositoryContext,
  patterns: string[],
  minBytes: number,
): Promise<string[]> {
  const found = await matches(context, patterns);
  const qualifying = await Promise.all(
    found.map(async (path) => ({ path, size: await safeFileSize(context.metadata.root, path) })),
  );
  return qualifying.filter(({ size }) => size !== null && size >= minBytes).map(({ path }) => path);
}

async function evaluatePathAny(
  context: RepositoryContext,
  check: Extract<EvidenceCheck, { type: 'path_any' }>,
) {
  const found = await nonEmptyMatches(context, check.patterns, check.min_bytes);
  return result(
    check.type,
    check.scope,
    found.length > 0 ? 'met' : 'not_met',
    `${found.length} safe, non-empty matching file(s)`,
    found,
  );
}

async function evaluatePathAll(
  context: RepositoryContext,
  check: Extract<EvidenceCheck, { type: 'path_all' }>,
) {
  const groups = await Promise.all(
    check.patterns.map(async (pattern) => nonEmptyMatches(context, [pattern], check.min_bytes)),
  );
  const missing = check.patterns.filter((_, index) => groups[index]?.length === 0);
  const found = [...new Set(groups.flat())].sort();
  return result(
    check.type,
    check.scope,
    missing.length === 0 ? 'met' : 'not_met',
    missing.length === 0
      ? 'Every required pattern matched a safe, non-empty file'
      : `Missing non-empty patterns: ${missing.join(', ')}`,
    found,
  );
}

async function evaluateOwnershipMap(
  context: RepositoryContext,
  check: Extract<EvidenceCheck, { type: 'ownership_map' }>,
): Promise<EvidenceResult> {
  const files = await readSearchableFiles(context, check.patterns);
  const inspected = files.map(({ path, text }) => ({
    path,
    entries: ownershipEntries(path, text),
  }));
  const qualifying = inspected.filter(({ entries }) => entries > 0);
  const entryCount = qualifying.reduce((total, { entries }) => total + entries, 0);
  return result(
    check.type,
    check.scope,
    qualifying.length > 0 ? 'met' : 'not_met',
    `${qualifying.length} ownership mapping file(s) with ${entryCount} structurally identifiable assignment(s) across ${files.length} candidate file(s)`,
    qualifying.map(({ path }) => path),
  );
}

function ownershipEntries(path: string, text: string): number {
  const name = basename(path).toLowerCase();
  const lines = text.split(/\r?\n/).map((line) => line.trim());

  if (name === 'codeowners') {
    return lines
      .filter((line) => !line.startsWith('#'))
      .filter((line) => {
        const fields = line.split(/\s+/);
        const inlineComment = fields.findIndex(
          (field, index) => index > 0 && field.startsWith('#'),
        );
        const ownerFields = fields.slice(1, inlineComment < 0 ? undefined : inlineComment);
        return (
          ownerFields.length > 0 &&
          isCodeownersTarget(fields[0] ?? '') &&
          ownerFields.every((field) => isOwnerHandle(field) || isExactEmailContact(field))
        );
      }).length;
  }

  if (['owners', 'owners.md', 'maintainers', 'maintainers.md'].includes(name)) {
    return conventionalOwnershipEntries(activeOwnershipLines(lines));
  }

  const contentLines = activeOwnershipLines(lines);
  return markdownOwnershipRows(contentLines) + explicitOwnershipMappings(contentLines);
}

function conventionalOwnershipEntries(lines: string[]): number {
  const listEntries = lines.filter(isConventionalOwnerListEntry).length;
  return listEntries + markdownOwnershipRows(lines) + explicitOwnershipMappings(lines);
}

function activeOwnershipLines(lines: string[]): string[] {
  const active: string[] = [];
  let inactiveHeadingLevel: number | null = null;
  for (const line of lines) {
    const section = ownershipSectionState(line, inactiveHeadingLevel);
    if (section.handled) {
      inactiveHeadingLevel = section.inactiveHeadingLevel;
      active.push('');
      continue;
    }
    if (inactiveHeadingLevel === null) active.push(line);
  }
  return active;
}

interface OwnershipSectionState {
  handled: boolean;
  inactiveHeadingLevel: number | null;
}

function ownershipSectionState(
  line: string,
  inactiveHeadingLevel: number | null,
): OwnershipSectionState {
  const heading = markdownHeading(line);
  if (heading) {
    if (inactiveHeadingLevel !== null && heading.level > inactiveHeadingLevel) {
      return { handled: true, inactiveHeadingLevel };
    }
    return {
      handled: true,
      inactiveHeadingLevel: inactiveOwnershipTitle(heading.title) ? heading.level : null,
    };
  }
  const plainHeading = plainOwnershipHeading(line);
  if (!plainHeading) return { handled: false, inactiveHeadingLevel };
  if (inactiveHeadingLevel !== null && inactiveHeadingLevel <= 6) {
    return { handled: true, inactiveHeadingLevel };
  }
  return {
    handled: true,
    inactiveHeadingLevel: inactiveOwnershipTitle(plainHeading) ? 7 : null,
  };
}

function inactiveOwnershipTitle(value: string): boolean {
  return /\b(?:former|inactive|past|retired)\b/i.test(value);
}

function plainOwnershipHeading(line: string): string | null {
  if (!line.endsWith(':') || line.includes('@')) return null;
  const title = line.slice(0, -1).trim();
  return /^[a-z][a-z0-9 &/_-]{1,80}$/i.test(title) ? title : null;
}

function markdownHeading(line: string): { level: number; title: string } | null {
  let level = 0;
  while (level < 6 && line[level] === '#') level += 1;
  if (level === 0 || !/\s/.test(line[level] ?? '')) return null;
  const title = line.slice(level).trim();
  return title.length > 0 ? { level, title } : null;
}

function markdownOwnershipRows(lines: string[]): number {
  let entries = 0;
  for (let index = 0; index < lines.length - 2; index += 1) {
    const columns = ownershipTableColumns(lines[index] ?? '', lines[index + 1] ?? '');
    if (!columns) continue;
    entries += countOwnershipTableRows(lines, index + 2, columns);
  }
  return entries;
}

interface OwnershipTableColumns {
  count: number;
  owner: number;
  scope: number;
}

function ownershipTableColumns(
  headerLine: string,
  separatorLine: string,
): OwnershipTableColumns | null {
  const header = markdownCells(headerLine);
  const separator = markdownCells(separatorLine);
  if (header.length < 2 || separator.length !== header.length) return null;
  if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) return null;
  const scope = header.findIndex((cell) =>
    /\b(path|component|module|area|scope|repository)\b/i.test(cell),
  );
  const owner = header.findIndex((cell) => /\b(owner|reviewer|maintainer|team)\b/i.test(cell));
  return scope < 0 || owner < 0 ? null : { count: header.length, owner, scope };
}

function countOwnershipTableRows(
  lines: string[],
  start: number,
  columns: OwnershipTableColumns,
): number {
  let entries = 0;
  for (let index = start; index < lines.length; index += 1) {
    const row = markdownCells(lines[index] ?? '');
    if (row.length !== columns.count) break;
    const scope = row[columns.scope] ?? '';
    const owner = row[columns.owner] ?? '';
    if (isOwnershipTableTarget(scope) && isOwnerReference(owner)) entries += 1;
  }
  return entries;
}

function isOwnershipTableTarget(value: string): boolean {
  const target = value.trim();
  if (isOwnershipTarget(target)) return true;
  const firstSpace = target.indexOf(' ');
  const prefix = firstSpace > 0 ? target.slice(0, firstSpace).toLowerCase() : '';
  if (namedOwnershipTargetPrefixes.has(prefix)) return false;
  if (/^(?:\.{0,2}\/|\/)/.test(target) || /[/*]/.test(target)) return false;
  return (
    !isPlaceholderOwner(target) &&
    target.length >= 2 &&
    target.length <= 100 &&
    /^[a-z0-9][a-z0-9 _-]*$/i.test(target)
  );
}

function markdownCells(line: string): string[] {
  if (!line.includes('|')) return [];
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function explicitOwnershipMappings(lines: string[]): number {
  return lines.filter((line) => {
    const mapping = parseOwnershipMapping(line);
    if (!mapping) return false;
    const { owner, target } = mapping;
    return isOwnershipTarget(target) && isOwnerReference(owner);
  }).length;
}

function isOwnershipTarget(value: string): boolean {
  const target = value.trim();
  if (repositoryWideOwnershipTargets.has(target.toLowerCase())) return true;
  const firstSpace = target.indexOf(' ');
  if (firstSpace > 0) {
    const prefix = target.slice(0, firstSpace).toLowerCase();
    if (namedOwnershipTargetPrefixes.has(prefix)) {
      const namedScope = target.slice(firstSpace + 1);
      return !isPlaceholderOwner(namedScope) && /[a-z0-9_-]/i.test(namedScope);
    }
  }
  if (/^(?:\.{0,2}\/|\/)/.test(target) || /[/*]/.test(target)) {
    return /[a-z0-9_-]/i.test(target.replace(/^\.{0,2}\//, ''));
  }
  return /^[a-z0-9_.-]+\.[a-z0-9]{1,10}$/i.test(target);
}

function isCodeownersTarget(value: string): boolean {
  const target = value.trim();
  if (['*', '**', '/*', '/**'].includes(target)) return true;
  return (
    target.length > 0 &&
    target.length <= 200 &&
    !target.startsWith('!') &&
    !target.includes('@') &&
    /^[^\s]+$/.test(target) &&
    /[a-z0-9_]/i.test(target)
  );
}

function parseOwnershipMapping(line: string): { owner: string; target: string } | null {
  const normalized = line.replace(/^[-*]\s*/, '').trim();
  const separators = ['=>', '->', ':'];
  const separator = separators
    .map((value) => ({ index: normalized.indexOf(value), value }))
    .filter(({ index }) => index > 0)
    .sort((left, right) => left.index - right.index)[0];
  if (!separator) return null;
  const target = normalized.slice(0, separator.index).trim();
  const owner = normalized.slice(separator.index + separator.value.length).trim();
  if (target.length === 0 || target.length > 100 || owner.length === 0 || owner.length > 120) {
    return null;
  }
  return { owner, target };
}

function isOwnerReference(value: string): boolean {
  const normalized = value
    .replace(/^[-*]\s*/, '')
    .replace(/[*_`]/g, '')
    .trim();
  if (isPlaceholderOwner(normalized) || hasNegativeOwnerAssignment(normalized)) return false;
  if (isDirectOwnerContact(normalized)) return true;
  const namedRole = namedOwnerRolePattern.exec(normalized);
  if (namedRole) return isNamedOwnerIdentity(namedRole[1] ?? '');
  const roleAssignment = ownerRoleAssignmentPattern.exec(normalized);
  return roleAssignment ? isNamedOwnerIdentity(roleAssignment[1] ?? '') : false;
}

function isConventionalOwnerListEntry(value: string): boolean {
  const normalized = value.replace(/^[-*]\s*/, '').trim();
  return !hasNegativeOwnerAssignment(normalized) && isDirectOwnerContact(normalized);
}

function isDirectOwnerContact(value: string): boolean {
  const namedEmail = /^([^<>]+?)\s*<([^<>\s]+)>$/.exec(value.trim());
  if (namedEmail) {
    return isNamedOwnerIdentity(namedEmail[1] ?? '') && isExactEmailContact(namedEmail[2] ?? '');
  }
  const contacts = value
    .replace(/\band\b/gi, ' ')
    .split(/[\s,&]+/)
    .filter(Boolean);
  return (
    contacts.length > 0 &&
    contacts.every((contact) => isOwnerHandle(contact) || isExactEmailContact(contact))
  );
}

function isOwnerHandle(value: string): boolean {
  return /^@[a-z0-9][a-z0-9_/-]*$/i.test(value);
}

function isExactEmailContact(value: string): boolean {
  if (/\s/.test(value)) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  const domain = value.slice(at + 1);
  const dot = domain.indexOf('.');
  return dot > 0 && dot < domain.length - 1 && !domain.endsWith('.');
}

function isNamedOwnerIdentity(value: string): boolean {
  const normalized = value.trim();
  return (
    !isPlaceholderOwner(normalized) &&
    !hasNegativeOwnerAssignment(normalized) &&
    /^[a-z0-9][a-z0-9 ._/-]{1,79}$/i.test(normalized)
  );
}

function hasNegativeOwnerAssignment(value: string): boolean {
  const inactiveRole = /\b(?:former|inactive|retired|unassigned|vacant|deprecated)\b/i.test(value);
  const absentRole =
    /\b(?:no|without)\s+(?:designated\s+)?(?:owner|maintainer|reviewer|team)s?\b/i.test(value);
  return inactiveRole || absentRole;
}

function isPlaceholderOwner(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return (
    placeholderOwnerValues.has(normalized) ||
    (normalized.length > 0 && normalized.replaceAll('-', '').length === 0)
  );
}

async function readSearchableFiles(
  context: RepositoryContext,
  patterns: string[],
  maxFilesPerPattern?: number,
  preserveCase = false,
): Promise<Array<{ path: string; text: string }>> {
  const cache =
    searchableFileCache.get(context) ??
    new Map<string, Promise<Array<{ path: string; text: string }>>>();
  searchableFileCache.set(context, cache);
  const key = JSON.stringify([patterns, maxFilesPerPattern ?? null, preserveCase]);
  const cached = cache.get(key);
  if (cached) return cached;
  const read = readSearchableFilesUncached(context, patterns, maxFilesPerPattern, preserveCase);
  cache.set(key, read);
  return read;
}

async function readSearchableFilesUncached(
  context: RepositoryContext,
  patterns: string[],
  maxFilesPerPattern?: number,
  preserveCase = false,
): Promise<Array<{ path: string; text: string }>> {
  const root = context.metadata.root;
  const paths = maxFilesPerPattern
    ? await prioritizedMatches(context, patterns, maxFilesPerPattern)
    : (await matches(context, patterns)).slice(0, maxContentFiles);
  const files: Array<{ path: string; text: string }> = [];
  const seenCanonicalPaths = new Set<string>();
  let totalBytes = 0;
  for (const path of paths) {
    const candidate = await readSearchableFile(
      root,
      path,
      preserveCase,
      seenCanonicalPaths,
      maxContentTotalBytes - totalBytes,
    );
    if (!candidate) continue;
    totalBytes += candidate.size;
    files.push({ path, text: candidate.text });
  }
  return files;
}

async function readSearchableFile(
  root: string,
  path: string,
  preserveCase: boolean,
  seenCanonicalPaths: Set<string>,
  remainingBytes: number,
): Promise<{ size: number; text: string } | null> {
  try {
    const requestedPath = resolve(root, path);
    if ((await lstat(requestedPath)).isSymbolicLink()) return null;
    const canonicalPath = await realpath(requestedPath);
    if (canonicalPath !== root && !canonicalPath.startsWith(`${root}${sep}`)) return null;
    if (seenCanonicalPaths.has(canonicalPath)) return null;
    const metadata = await stat(canonicalPath);
    if (!metadata.isFile() || metadata.size === 0 || metadata.size > maxContentFileBytes)
      return null;
    if (metadata.size > remainingBytes) return null;
    const rawText = await readFile(canonicalPath, 'utf8');
    if (isGeneratedAssessment(rawText)) return null;
    seenCanonicalPaths.add(canonicalPath);
    return { size: metadata.size, text: preserveCase ? rawText : rawText.toLowerCase() };
  } catch {
    // Races, unreadable files, and binary content are unavailable evidence.
    return null;
  }
}

async function prioritizedMatches(
  context: RepositoryContext,
  patterns: string[],
  maxFilesPerPattern: number,
): Promise<string[]> {
  const selected: string[] = [];
  const seen = new Set<string>();
  const groups = await Promise.all(
    patterns.map(async (pattern) =>
      (await matches(context, [pattern])).slice(0, maxFilesPerPattern),
    ),
  );
  for (let candidateIndex = 0; candidateIndex < maxFilesPerPattern; candidateIndex += 1) {
    for (const group of groups) {
      const path = group[candidateIndex];
      if (!path) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      selected.push(path);
      if (selected.length === maxContentFiles) return selected;
    }
  }
  return selected;
}

function isGeneratedAssessment(text: string): boolean {
  const normalized = text.trimStart();
  if (normalized.toLowerCase().startsWith('# agentic development readiness assessment')) {
    return true;
  }
  if (!normalized.startsWith('{')) return false;

  try {
    const candidate = JSON.parse(normalized) as unknown;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const report = candidate as Record<string, unknown>;
    const benchmark = report.benchmark;
    return (
      Boolean(benchmark) &&
      typeof benchmark === 'object' &&
      !Array.isArray(benchmark) &&
      (benchmark as Record<string, unknown>).id === 'agentic-development-readiness' &&
      typeof report.assessed_at === 'string' &&
      Array.isArray(report.controls)
    );
  } catch {
    return false;
  }
}

async function evaluateLegacyContent(
  context: RepositoryContext,
  check: Extract<EvidenceCheck, { type: 'content_any' | 'content_all' }>,
): Promise<EvidenceResult> {
  const files = await readSearchableFiles(context, check.files);
  const matchingFiles = files.filter(({ text }) =>
    check.needles.some((needle) => text.includes(needle.toLowerCase())),
  );
  const matchedNeedles = check.needles.filter((needle) =>
    files.some(({ text }) => text.includes(needle.toLowerCase())),
  );
  const passed =
    check.type === 'content_any'
      ? matchedNeedles.length > 0
      : matchedNeedles.length === check.needles.length;
  return result(
    check.type,
    check.scope,
    passed ? 'met' : 'not_met',
    `Matched ${matchedNeedles.length}/${check.needles.length} term(s) across ${files.length} candidate file(s)`,
    matchingFiles.map(({ path }) => path),
  );
}

async function evaluateContentTerms(
  context: RepositoryContext,
  check: Extract<EvidenceCheck, { type: 'content_terms' }>,
): Promise<EvidenceResult> {
  const files = await readSearchableFiles(context, check.files, check.max_files_per_pattern);
  const matchesByFile = files.map(({ path, text }) => ({
    path,
    ...strongestContentMatch(
      text,
      check.terms,
      check.required_any_terms ?? [],
      check.min_terms,
      check.max_span_lines,
    ),
  }));
  const qualifying = matchesByFile.filter(({ qualifies }) => qualifies);
  const strongest = matchesByFile.reduce((maximum, file) => Math.max(maximum, file.matched), 0);
  const strongestRequired = matchesByFile.reduce(
    (maximum, file) => Math.max(maximum, file.requiredMatched),
    0,
  );
  const requiredSummary = check.required_any_terms
    ? `; strongest required match ${strongestRequired}/${check.required_any_terms.length}`
    : '';
  const proximitySummary = check.max_span_lines
    ? ` within ${check.max_span_lines}-line window(s)`
    : '';
  return result(
    check.type,
    check.scope,
    qualifying.length > 0 ? 'met' : 'not_met',
    `${qualifying.length} qualifying file(s); strongest co-located match ${strongest}/${check.terms.length} term(s)${requiredSummary}${proximitySummary} across ${files.length} candidate file(s); threshold ${check.min_terms}`,
    qualifying.map(({ path }) => path),
  );
}

async function evaluateContentGroups(
  context: RepositoryContext,
  check: Extract<EvidenceCheck, { type: 'content_groups' }>,
): Promise<EvidenceResult> {
  const files = await readSearchableFiles(context, check.files, check.max_files_per_pattern);
  const matchesByFile = files.map(({ path, text }) => ({
    path,
    ...strongestGroupMatch(text, check.groups, check.min_groups, check.max_span_lines),
  }));
  const qualifying = matchesByFile.filter(({ qualifies }) => qualifies);
  const strongest = matchesByFile.reduce<{
    path: string | null;
    matchedGroups: string[];
    qualifies: boolean;
  }>(
    (maximum, candidate) =>
      candidate.matchedGroups.length > maximum.matchedGroups.length ? candidate : maximum,
    { path: null, matchedGroups: [], qualifies: false },
  );
  const matched = new Set(strongest.matchedGroups);
  const missing = check.groups.map(({ id }) => id).filter((id) => !matched.has(id));
  const proximitySummary = check.max_span_lines
    ? ` within ${check.max_span_lines}-line window(s)`
    : '';
  const partialReferences =
    qualifying.length > 0
      ? qualifying.map(({ path }) => path)
      : matchesByFile
          .filter(({ matchedGroups }) => matchedGroups.length === strongest.matchedGroups.length)
          .filter(({ matchedGroups }) => matchedGroups.length > 0)
          .map(({ path }) => path);
  return result(
    check.type,
    check.scope,
    qualifying.length > 0 ? 'met' : 'not_met',
    `${qualifying.length} qualifying file(s); strongest semantic coverage ${strongest.matchedGroups.length}/${check.groups.length} group(s)${proximitySummary} across ${files.length} candidate file(s); matched: ${strongest.matchedGroups.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'}; threshold ${check.min_groups}`,
    partialReferences,
  );
}

function strongestGroupMatch(
  text: string,
  groups: Array<{ id: string; terms: string[] }>,
  minGroups: number,
  maxSpanLines?: number,
): { matchedGroups: string[]; qualifies: boolean } {
  if (!maxSpanLines) {
    const lines = text.split(/\r?\n/);
    const matchedGroups = groups
      .filter(({ terms }) =>
        terms.some((term) => lines.some((line) => containsPositiveTerm(line, term))),
      )
      .map(({ id }) => id);
    return { matchedGroups, qualifies: matchedGroups.length >= minGroups };
  }

  const groupCounts = groups.map(() => 0);
  const lines = text.split(/\r?\n/);
  let strongestGroups: string[] = [];

  const update = (line: string, direction: 1 | -1) => {
    groups.forEach(({ terms }, index) => {
      if (terms.some((term) => containsPositiveTerm(line, term))) {
        groupCounts[index] = (groupCounts[index] ?? 0) + direction;
      }
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    update(lines[index] ?? '', 1);
    if (index >= maxSpanLines) update(lines[index - maxSpanLines] ?? '', -1);
    const activeGroups = groups
      .filter((_, groupIndex) => (groupCounts[groupIndex] ?? 0) > 0)
      .map(({ id }) => id);
    if (activeGroups.length > strongestGroups.length) strongestGroups = activeGroups;
  }

  return { matchedGroups: strongestGroups, qualifies: strongestGroups.length >= minGroups };
}

async function evaluateCiCommand(
  context: RepositoryContext,
  check: Extract<EvidenceCheck, { type: 'ci_command' }>,
): Promise<EvidenceResult> {
  const bindings = await repositoryCommandBindings(context, check.tools);
  const patterns = check.providers.flatMap(({ files }) => files);
  const files = await readSearchableFiles(context, patterns, check.max_files_per_pattern, true);
  const providerPaths = await Promise.all(
    check.providers.map(async (provider) => ({
      id: provider.id,
      paths: new Set(await matches(context, provider.files)),
    })),
  );
  const inspected = files.map(({ path, text }) => {
    const invocations = providerPaths.flatMap(({ id, paths }) =>
      paths.has(path) ? ciIntegrationInvocations(id, text) : [],
    );
    const matchesByExecution = new Map<string, Set<string>>();
    for (const invocation of invocations) {
      const matches = matchesByExecution.get(invocation.executionGroup) ?? new Set<string>();
      for (const tool of check.tools) {
        if (invocationMatchesTool(invocation, tool, bindings, check.invocation_grammar)) {
          matches.add(tool.id);
        }
      }
      matchesByExecution.set(invocation.executionGroup, matches);
    }
    const matchedToolIds = new Set(
      [...matchesByExecution.values()].flatMap((identities) => [...identities]),
    );
    return {
      path,
      matchedTools: check.tools.filter(({ id }) => matchedToolIds.has(id)),
      strongestExecutionMatch: Math.max(
        0,
        ...[...matchesByExecution.values()].map(({ size }) => size),
      ),
    };
  });
  const matchedToolIds = new Set(
    inspected.flatMap(({ matchedTools }) => matchedTools.map(({ id }) => id)),
  );
  const contributing = inspected.filter(({ matchedTools }) => matchedTools.length > 0);
  const strongestExecutionMatch = Math.max(
    0,
    ...inspected.map(({ strongestExecutionMatch }) => strongestExecutionMatch),
  );
  const passed =
    check.tool_match_mode === 'same-execution'
      ? strongestExecutionMatch >= check.min_tools
      : matchedToolIds.size >= check.min_tools;
  const matchSummary =
    check.tool_match_mode === 'same-execution'
      ? `strongest execution-group command-class match ${strongestExecutionMatch}/${check.tools.length}`
      : `aggregate command-class match ${matchedToolIds.size}/${check.tools.length}`;
  return result(
    check.type,
    check.scope,
    passed ? 'met' : 'not_met',
    `${contributing.length} contributing CI configuration file(s) contain enabled integration-triggered recognized commands; ${matchSummary} across ${files.length} candidate file(s); threshold ${check.min_tools}`,
    contributing.map(({ path }) => path),
  );
}

interface CiInvocation {
  executionGroup: string;
  kind: 'action' | 'command';
  failFast?: boolean;
  value: string;
}

interface RepositoryCommandBindings {
  availableCommandPaths: Set<string>;
  commandSources: Map<string, string>;
  packageScripts: Map<string, string>;
}

type CiProviderId = Extract<EvidenceCheck, { type: 'ci_command' }>['providers'][number]['id'];
type CiTool = Extract<EvidenceCheck, { type: 'ci_command' }>['tools'][number];
type CiInvocationGrammar = Extract<EvidenceCheck, { type: 'ci_command' }>['invocation_grammar'];

async function repositoryCommandBindings(
  context: RepositoryContext,
  tools: CiTool[],
): Promise<RepositoryCommandBindings> {
  const commandPaths = [
    ...new Set(
      tools.flatMap(({ commands }) =>
        commands.flatMap(({ argument_groups, repository_executables }) => [
          ...repository_executables.map(normalizeCommandPath),
          ...argument_groups.flatMap((arguments_) =>
            arguments_.filter(isRepositoryCommandPath).map(normalizeCommandPath),
          ),
        ]),
      ),
    ),
  ];
  const commandSources = new Map(
    (await readSearchableFiles(context, commandPaths, undefined, true)).map(({ path, text }) => [
      normalizeCommandPath(path),
      text,
    ]),
  );
  const availableCommandPaths = new Set(commandSources.keys());
  const packageFile = (await readSearchableFiles(context, ['package.json'], undefined, true)).find(
    ({ path }) => path === 'package.json',
  );
  if (!packageFile) return { availableCommandPaths, commandSources, packageScripts: new Map() };
  try {
    const document = asRecord(JSON.parse(packageFile.text));
    const scripts = asRecord(document?.scripts);
    return {
      availableCommandPaths,
      commandSources,
      packageScripts: new Map(
        Object.entries(scripts ?? {})
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
          .map(([name, command]) => [name, command]),
      ),
    };
  } catch {
    return { availableCommandPaths, commandSources, packageScripts: new Map() };
  }
}

function isRepositoryCommandPath(value: string): boolean {
  return /(?:^|\/)scripts?\/|^\.{1,2}\/.+/i.test(value);
}

function normalizeCommandPath(value: string): string {
  return value.replace(/^\.\//, '');
}

function ciIntegrationInvocations(provider: CiProviderId, text: string): CiInvocation[] {
  try {
    const document = asRecord(parse(text, { maxAliasCount: 50 }));
    if (!document) return [];
    if (provider === 'github-actions') return githubIntegrationInvocations(document);
    if (provider === 'gitlab-ci') return gitlabIntegrationInvocations(document);
    return azureIntegrationInvocations(document);
  } catch {
    return [];
  }
}

function githubIntegrationInvocations(document: Record<string, unknown>): CiInvocation[] {
  const events = githubIntegrationTriggers(document.on);
  if (events.size === 0) return [];
  const jobs = asRecord(document.jobs);
  if (!jobs) return [];
  const workflowDefaults = githubRunDefaults(document.defaults);
  if (!workflowDefaults.valid) return [];
  return Object.entries(jobs).flatMap(([name, job]) =>
    githubJobInvocations(job, events, workflowDefaults, `github:${name}`),
  );
}

function githubJobInvocations(
  value: unknown,
  parentEvents: Set<string>,
  workflowDefaults: GitHubRunDefaults,
  executionGroup: string,
): CiInvocation[] {
  const job = asRecord(value);
  if (!job || isDisabledCiNode(job)) return [];
  const jobCondition = githubConditionEvents(job.if, parentEvents);
  if (!jobCondition.certain || jobCondition.events.size === 0) return [];
  const events = jobCondition.events;
  const steps = asArray(job.steps);
  if (steps.length === 0 || !hasGithubRunner(job['runs-on'])) return [];
  const jobDefaults = githubRunDefaults(job.defaults);
  if (!jobDefaults.valid) return [];
  const runDefaults = mergeGithubRunDefaults(workflowDefaults, jobDefaults);
  const checkoutEvents = new Set<string>();
  return steps.flatMap((stepValue) => {
    const step = asRecord(stepValue);
    if (!step) return [];
    const condition = githubConditionEvents(step.if, events);
    const checkout = githubCheckoutDisposition(step);
    if (checkout) {
      if (checkout === 'preserve') return [];
      const affectedEvents = condition.certain ? condition.events : events;
      affectedEvents.forEach((event) => {
        if (condition.certain && !isDisabledCiNode(step) && checkout === 'target') {
          checkoutEvents.add(event);
        } else checkoutEvents.delete(event);
      });
      return [];
    }
    if (!condition.certain || isDisabledCiNode(step)) return [];
    const stepEvents = condition.events;
    if (stepEvents.size === 0) return [];
    const executableEvents = new Set([...stepEvents].filter((event) => checkoutEvents.has(event)));
    if (executableEvents.size === 0) return [];
    return githubStepInvocations(
      step,
      runDefaults.workingDirectory,
      runDefaults.shell,
      job['runs-on'],
      executionGroup,
      executableEvents,
    );
  });
}

function hasGithubRunner(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return (
    Array.isArray(value) && value.some((entry) => typeof entry === 'string' && entry.length > 0)
  );
}

function githubCheckoutDisposition(
  step: Record<string, unknown>,
): 'preserve' | 'replace' | 'target' | null {
  if (typeof step.uses !== 'string') return null;
  if (!/^actions\/checkout@[^@\s]+$/i.test(step.uses.trim())) return null;
  if (step.run !== undefined) return 'replace';
  if (step.with === undefined) return 'target';
  const inputs = asRecord(step.with);
  if (!inputs) return 'replace';
  if (Object.hasOwn(inputs, 'path')) {
    return githubCheckoutPathIsSeparate(inputs.path) ? 'preserve' : 'replace';
  }
  return ['filter', 'path', 'ref', 'repository', 'sparse-checkout'].some((field) =>
    Object.hasOwn(inputs, field),
  )
    ? 'replace'
    : 'target';
}

function githubCheckoutPathIsSeparate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    githubWorkingDirectoryIsRoot(normalized) ||
    normalized.includes('${{') ||
    normalized.startsWith('/') ||
    /^[a-z]:[\\/]/i.test(normalized)
  ) {
    return false;
  }
  return !normalized.split(/[\\/]+/).includes('..');
}

interface GitHubRunDefaults {
  shell: unknown;
  valid: boolean;
  workingDirectory: unknown;
}

function githubRunDefaults(value: unknown): GitHubRunDefaults {
  if (value === undefined) return { shell: undefined, valid: true, workingDirectory: undefined };
  const defaults = asRecord(value);
  if (!defaults) return { shell: undefined, valid: false, workingDirectory: undefined };
  if (defaults.run === undefined) {
    return { shell: undefined, valid: true, workingDirectory: undefined };
  }
  const run = asRecord(defaults.run);
  return run
    ? { shell: run.shell, valid: true, workingDirectory: run['working-directory'] }
    : { shell: undefined, valid: false, workingDirectory: undefined };
}

function mergeGithubRunDefaults(
  workflow: GitHubRunDefaults,
  job: GitHubRunDefaults,
): GitHubRunDefaults {
  return {
    valid: workflow.valid && job.valid,
    shell: job.shell ?? workflow.shell,
    workingDirectory: job.workingDirectory ?? workflow.workingDirectory,
  };
}

function githubStepInvocations(
  value: unknown,
  defaultWorkingDirectory: unknown,
  defaultShell: unknown,
  runner: unknown,
  executionGroup: string,
  events: Set<string>,
): CiInvocation[] {
  const step = asRecord(value);
  if (!step || isDisabledCiNode(step)) return [];
  if (step.uses !== undefined && step.run !== undefined) return [];
  const action = invocationFromField(step, 'uses', 'action', executionGroup);
  const shell = githubShellSemantics(step.shell ?? defaultShell, runner);
  const command =
    githubWorkingDirectoryIsRoot(step['working-directory'] ?? defaultWorkingDirectory) &&
    shell.supported
      ? invocationFromField(step, 'run', 'command', executionGroup, shell.failFast)
      : null;
  const invocations = [action, command].filter(
    (invocation): invocation is CiInvocation => invocation !== null,
  );
  return [...events].flatMap((event) =>
    invocations.map((invocation) => ({
      ...invocation,
      executionGroup: `${executionGroup}:event-${event}`,
    })),
  );
}

function githubShellSemantics(
  value: unknown,
  runner: unknown,
): { failFast: boolean; supported: boolean } {
  if (value === undefined) {
    return githubRunnerUsesFailFastDefaultShell(runner)
      ? { failFast: true, supported: true }
      : { failFast: false, supported: false };
  }
  if (typeof value !== 'string') return { failFast: false, supported: false };
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (['bash', 'sh'].includes(normalized)) return { failFast: true, supported: true };
  if (['bash {0}', 'sh {0}'].includes(normalized)) {
    return { failFast: false, supported: true };
  }
  return { failFast: false, supported: false };
}

function githubRunnerUsesFailFastDefaultShell(value: unknown): boolean {
  const labels = (Array.isArray(value) ? value : [value]).filter(
    (label): label is string => typeof label === 'string',
  );
  if (labels.length === 0 || labels.some((label) => label.includes('${{'))) return false;
  const normalized = labels.map((label) => label.trim().toLowerCase());
  if (normalized.some((label) => label.includes('windows'))) return false;
  return normalized.some((label) =>
    ['ubuntu', 'linux', 'macos'].some((operatingSystem) => label.includes(operatingSystem)),
  );
}

function githubWorkingDirectoryIsRoot(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '');
  return ['.', './', '${{github.workspace}}', '$github_workspace', '${github_workspace}'].includes(
    normalized,
  );
}

function invocationFromField(
  node: Record<string, unknown>,
  field: string,
  kind: CiInvocation['kind'],
  executionGroup: string,
  failFast?: boolean,
): CiInvocation | null {
  const value = node[field];
  return typeof value === 'string'
    ? {
        kind,
        value,
        executionGroup,
        ...(kind === 'command' && failFast !== undefined ? { failFast } : {}),
      }
    : null;
}

function gitlabIntegrationInvocations(document: Record<string, unknown>): CiInvocation[] {
  if (document.include !== undefined) return [];
  if (document.before_script !== undefined) return [];
  if (!validGitlabWorkflowShape(document.workflow)) return [];
  const workflow = asRecord(document.workflow);
  const hasWorkflowRules = asArray(workflow?.rules).length > 0;
  const workflowAllowsMergeRequests = hasGitlabMergeRequestRule(workflow?.rules);
  if (hasWorkflowRules && !workflowAllowsMergeRequests) return [];
  if (hasRiskyGitlabDefaults(document.default)) return [];
  return Object.entries(document).flatMap(([name, value]) =>
    gitlabJobInvocations(name, value, workflowAllowsMergeRequests, document.variables),
  );
}

function validGitlabWorkflowShape(value: unknown): boolean {
  if (value === undefined) return true;
  const workflow = asRecord(value);
  return workflow !== null && (workflow.rules === undefined || Array.isArray(workflow.rules));
}

function gitlabJobInvocations(
  name: string,
  value: unknown,
  workflowAllowsMergeRequests: boolean,
  globalVariables: unknown,
): CiInvocation[] {
  if (name.startsWith('.') || gitlabReservedKeys.has(name)) return [];
  const job = asRecord(value);
  if (!job || isDisabledCiNode(job)) return [];
  if (job.rules !== undefined && !Array.isArray(job.rules)) return [];
  if (
    job.before_script !== undefined ||
    job.extends !== undefined ||
    job.inherit !== undefined ||
    job.except !== undefined
  ) {
    return [];
  }
  if (!isSupportedBlockingGitlabWhen(job.when)) return [];
  if (!gitlabRepositoryAvailable(globalVariables, job.variables)) return [];
  const hasJobTriggerRules = asArray(job.rules).length > 0 || job.only !== undefined;
  const jobAllowsMergeRequests =
    hasGitlabMergeRequestRule(job.rules) ||
    hasUnconditionallyNamedTrigger(job.only, ['merge_requests']);
  if (hasJobTriggerRules ? !jobAllowsMergeRequests : !workflowAllowsMergeRequests) return [];
  return stringValues(job.script).map((command) => ({
    executionGroup: `gitlab:${name}`,
    kind: 'command',
    value: command,
  }));
}

function isSupportedBlockingGitlabWhen(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'string' && ['always', 'on_success'].includes(value.toLowerCase()))
  );
}

function gitlabRepositoryAvailable(globalValue: unknown, jobValue: unknown): boolean {
  const globalVariables = asRecord(globalValue);
  const jobVariables = asRecord(jobValue);
  const strategy = effectiveCiVariable(jobVariables, globalVariables, 'GIT_STRATEGY');
  const checkout = effectiveCiVariable(jobVariables, globalVariables, 'GIT_CHECKOUT');
  if (checkout === false || (typeof checkout === 'string' && checkout.toLowerCase() === 'false')) {
    return false;
  }
  return (
    strategy === undefined ||
    (typeof strategy === 'string' && ['clone', 'fetch'].includes(strategy.toLowerCase()))
  );
}

function effectiveCiVariable(
  primary: Record<string, unknown> | null,
  fallback: Record<string, unknown> | null,
  name: string,
): unknown {
  const keys = [name, name.toLowerCase()];
  for (const source of [primary, fallback]) {
    if (!source) continue;
    for (const key of keys) {
      if (Object.hasOwn(source, key)) return source[key];
    }
  }
  return undefined;
}

function hasRiskyGitlabDefaults(value: unknown): boolean {
  if (value === undefined) return false;
  const defaults = asRecord(value);
  if (!defaults) return true;
  if (Object.hasOwn(defaults, 'allow_failure') && defaults.allow_failure !== false) return true;
  return ['before_script', 'except', 'only', 'rules', 'script', 'when'].some((key) =>
    Object.hasOwn(defaults, key),
  );
}

function azureIntegrationInvocations(document: Record<string, unknown>): CiInvocation[] {
  if (!hasAzurePullRequestTrigger(document.pr)) return [];
  return collectAzureInvocations(document, 'root', 'azure:root');
}

type AzureNodeKind = 'root' | 'stage' | 'job' | 'step';

function collectAzureInvocations(
  node: Record<string, unknown>,
  kind: AzureNodeKind,
  executionGroup: string,
): CiInvocation[] {
  if (isDisabledCiNode(node) || azurePullRequestCondition(node.condition) !== 'allow') return [];
  if (kind === 'step') return azureStepInvocations(node, executionGroup);
  if (kind === 'stage') return azureChildInvocations(node.jobs, 'job', executionGroup);
  if (kind === 'job') return azureStepsInvocations(node.steps, executionGroup);
  const rootCollections = [
    { kind: 'stage' as const, value: node.stages },
    { kind: 'job' as const, value: node.jobs },
    { kind: 'step' as const, value: node.steps },
  ].filter((collection) => collection.value !== undefined);
  if (rootCollections.length !== 1) return [];
  const collection = rootCollections[0];
  if (!collection) return [];
  return collection.kind === 'step'
    ? azureStepsInvocations(collection.value, executionGroup)
    : azureChildInvocations(collection.value, collection.kind, executionGroup);
}

function azureChildInvocations(
  value: unknown,
  kind: AzureNodeKind,
  parentGroup: string,
): CiInvocation[] {
  return asArray(value).flatMap((childValue, index) => {
    const child = asRecord(childValue);
    return child ? collectAzureInvocations(child, kind, `${parentGroup}:${kind}-${index}`) : [];
  });
}

function azureStepInvocations(
  node: Record<string, unknown>,
  executionGroup: string,
): CiInvocation[] {
  const commandFields = ['script', 'bash', 'pwsh', 'powershell'].filter(
    (field) => typeof node[field] === 'string',
  );
  if (commandFields.length !== 1 || !azureWorkingDirectoryIsRoot(node.workingDirectory)) return [];
  const commandField = commandFields[0] ?? '';
  const value = node[commandField] as string;
  return [
    {
      executionGroup,
      kind: 'command',
      value,
      failFast: azureScriptIsFailFast(value, commandField),
    },
  ];
}

function azureScriptIsFailFast(value: string, commandField: string): boolean {
  if (['pwsh', 'powershell'].includes(commandField)) {
    return value
      .split(/\r?\n/)
      .some((line) => /^\s*\$erroractionpreference\s*=\s*['"]stop['"]\s*$/i.test(line));
  }
  return value
    .split(/\r?\n/)
    .some((line) => /^\s*set\s+(?:-e(?:o\s+pipefail)?|-o\s+errexit)\s*$/i.test(line));
}

function azureWorkingDirectoryIsRoot(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '');
  return [
    '.',
    './',
    '$(build.repository.localpath)',
    '$(build.sourcesdirectory)',
    '$(pipeline.workspace)/s',
    '$(system.defaultworkingdirectory)',
  ].includes(normalized);
}

function azureStepsInvocations(value: unknown, executionGroup: string): CiInvocation[] {
  const steps = asArray(value);
  let repositoryAvailable = !steps.some((stepValue) => {
    const step = asRecord(stepValue);
    return step !== null && Object.hasOwn(step, 'checkout');
  });
  return steps.flatMap((stepValue) => {
    const step = asRecord(stepValue);
    if (!step) return [];
    const condition = azurePullRequestCondition(step.condition);
    if (Object.hasOwn(step, 'checkout')) {
      if (condition === 'unknown') repositoryAvailable = false;
      else if (condition === 'allow') {
        repositoryAvailable =
          !isDisabledCiNode(step) &&
          typeof step.checkout === 'string' &&
          step.checkout.toLowerCase() === 'self';
      }
      return [];
    }
    if (condition !== 'allow' || isDisabledCiNode(step)) return [];
    return repositoryAvailable ? azureStepInvocations(step, executionGroup) : [];
  });
}

function hasNamedTrigger(value: unknown, names: string[]): boolean {
  if (typeof value === 'string') return names.includes(value.toLowerCase());
  if (Array.isArray(value)) {
    return value.some((entry) => typeof entry === 'string' && names.includes(entry.toLowerCase()));
  }
  const record = asRecord(value);
  if (!record) return false;
  if (names.some((name) => Object.hasOwn(record, name))) return true;
  return Object.hasOwn(record, 'refs') && hasNamedTrigger(record.refs, names);
}

function hasUnconditionallyNamedTrigger(value: unknown, names: string[]): boolean {
  if (typeof value === 'string' || Array.isArray(value)) return hasNamedTrigger(value, names);
  const record = asRecord(value);
  if (!record || Object.keys(record).some((key) => key !== 'refs')) return false;
  return hasNamedTrigger(record.refs, names);
}

function githubIntegrationTriggers(value: unknown): Set<string> {
  return new Set(
    ['pull_request', 'merge_group'].filter((name) => githubTriggerAllowsIntegration(value, name)),
  );
}

function githubTriggerAllowsIntegration(value: unknown, name: string): boolean {
  if (typeof value === 'string' || Array.isArray(value)) return hasNamedTrigger(value, [name]);
  const triggers = asRecord(value);
  if (!triggers || !Object.hasOwn(triggers, name)) return false;
  const configuration = triggers[name];
  if (configuration === null || configuration === undefined) return true;
  const trigger = asRecord(configuration);
  if (!trigger) return false;
  if (['paths', 'paths-ignore'].some((key) => Object.hasOwn(trigger, key))) return false;
  if (trigger.types === undefined) return true;
  const types = new Set(stringValues(trigger.types).map((type) => type.toLowerCase()));
  const requiredTypes =
    name === 'pull_request' ? ['opened', 'reopened', 'synchronize'] : ['checks_requested'];
  return requiredTypes.every((type) => types.has(type));
}

interface GitHubConditionEvents {
  certain: boolean;
  events: Set<string>;
}

function githubConditionEvents(value: unknown, parentEvents: Set<string>): GitHubConditionEvents {
  if (value === undefined || value === true) {
    return { certain: true, events: new Set(parentEvents) };
  }
  if (value === false) return { certain: true, events: new Set() };
  if (typeof value !== 'string') return { certain: false, events: new Set() };
  return githubStringConditionEvents(value, parentEvents);
}

function githubStringConditionEvents(
  value: string,
  parentEvents: Set<string>,
): GitHubConditionEvents {
  const condition = value.toLowerCase();
  const normalized = condition.replace(/[\s${}]/g, '');
  if (!condition.includes('github.event_name')) {
    return githubStatusConditionEvents(normalized, parentEvents);
  }
  const equals = [...condition.matchAll(/github\.event_name\s*==\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? '',
  );
  const excludes = [...condition.matchAll(/github\.event_name\s*!=\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? '',
  );
  if (equals.length === 0 && excludes.length === 0) {
    return { certain: false, events: new Set() };
  }
  const unsupported = condition
    .replace(/github\.event_name\s*(?:==|!=)\s*['"][^'"]+['"]/g, '')
    .replaceAll('!cancelled()', '')
    .replace(/\b(?:always|success)\(\)/g, '')
    .replace(/[\s${}()&|]/g, '');
  if (unsupported.length > 0) return { certain: false, events: new Set() };
  const hasConjunction = condition.includes('&&');
  const hasDisjunction = condition.includes('||');
  if (hasConjunction && hasDisjunction) return { certain: false, events: new Set() };
  if (new Set(equals).size > 1 && !hasDisjunction) {
    return { certain: true, events: new Set() };
  }
  const candidates =
    equals.length > 0 ? equals.filter((event) => parentEvents.has(event)) : [...parentEvents];
  return {
    certain: true,
    events: new Set(candidates.filter((event) => !excludes.includes(event))),
  };
}

function githubStatusConditionEvents(
  normalized: string,
  parentEvents: Set<string>,
): GitHubConditionEvents {
  if (['true', 'always()', 'success()', '!cancelled()'].includes(normalized)) {
    return { certain: true, events: new Set(parentEvents) };
  }
  if (['false', 'never'].includes(normalized)) return { certain: true, events: new Set() };
  return { certain: false, events: new Set() };
}

function hasGitlabMergeRequestRule(value: unknown): boolean {
  for (const ruleValue of asArray(value)) {
    const disposition = gitlabMergeRequestRuleDisposition(ruleValue);
    if (disposition === 'unsupported') return false;
    if (disposition === 'skip') continue;
    return disposition === 'allow';
  }
  return false;
}

type GitlabRuleDisposition = 'allow' | 'deny' | 'skip' | 'unsupported';

function gitlabMergeRequestRuleDisposition(value: unknown): GitlabRuleDisposition {
  const rule = asRecord(value);
  if (!rule || Object.keys(rule).some((key) => !supportedGitlabRuleKeys.has(key))) {
    return 'unsupported';
  }
  const applies = gitlabRuleAppliesToMergeRequest(rule.if);
  if (applies === null) return 'unsupported';
  if (!applies) return 'skip';
  if (!isSupportedBlockingGitlabRule(rule)) return 'deny';
  return 'allow';
}

function gitlabRuleAppliesToMergeRequest(value: unknown): boolean | null {
  if (value === undefined) return true;
  if (typeof value !== 'string') return null;
  const comparison = /^\s*\$?ci_pipeline_source\s*(==|!=)\s*['"]([^'"]+)['"]\s*$/i.exec(value);
  if (!comparison) return null;
  const event = comparison[2]?.toLowerCase();
  return comparison[1] === '==' ? event === 'merge_request_event' : event !== 'merge_request_event';
}

function isSupportedBlockingGitlabRule(rule: Record<string, unknown>): boolean {
  if (isDisabledCiNode(rule)) return false;
  if (rule.when === undefined) return true;
  return (
    typeof rule.when === 'string' && ['always', 'on_success'].includes(rule.when.toLowerCase())
  );
}

function hasAzurePullRequestTrigger(value: unknown): boolean {
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === 'string') return !['none', 'false'].includes(value.toLowerCase());
  if (Array.isArray(value)) return value.length > 0;
  const trigger = asRecord(value);
  if (!trigger) return false;
  if (Object.hasOwn(trigger, 'paths')) return false;
  const branches = asRecord(trigger.branches);
  if (!branches) return true;
  const include = stringValues(branches.include).map((branch) => branch.toLowerCase());
  const exclude = stringValues(branches.exclude).map((branch) => branch.toLowerCase());
  if (exclude.includes('*')) return false;
  if (include.length > 0) return include.some((branch) => !['none', 'false'].includes(branch));
  return true;
}

type CiConditionDisposition = 'allow' | 'deny' | 'unknown';

function azurePullRequestCondition(value: unknown): CiConditionDisposition {
  if (value === undefined || value === true) return 'allow';
  if (value === false) return 'deny';
  if (typeof value !== 'string') return 'unknown';
  const condition = value.toLowerCase().replace(/\s+/g, '');
  if (['always()', 'succeeded()', 'succeededorfailed()'].includes(condition)) return 'allow';
  const direct = azureReasonComparison(condition);
  if (direct !== null) return direct ? 'allow' : 'deny';
  const conjunction = /^and\((?:always|succeeded|succeededorfailed)\(\),(.+)\)$/.exec(condition);
  if (!conjunction) return 'unknown';
  const nested = azureReasonComparison(conjunction[1] ?? '');
  if (nested === null) return 'unknown';
  return nested ? 'allow' : 'deny';
}

function azureReasonComparison(condition: string): boolean | null {
  const comparison = /^(eq|ne)\(variables\[['"]build\.reason['"]\],['"]([^'"]+)['"]\)$/.exec(
    condition,
  );
  if (!comparison) return null;
  const equalsPullRequest = comparison[2] === 'pullrequest';
  return comparison[1] === 'eq' ? equalsPullRequest : !equalsPullRequest;
}

function isDisabledCiNode(node: Record<string, unknown>): boolean {
  if (
    node.enabled === false ||
    configuredNonBlocking(node, ['allow_failure']) ||
    configuredNonBlocking(node, ['continue-on-error', 'continueonerror', 'continueOnError'])
  ) {
    return true;
  }
  if (typeof node.when === 'string' && ['never', 'manual'].includes(node.when.toLowerCase())) {
    return true;
  }
  return [node.if, node.condition].some((condition) => {
    if (condition === false) return true;
    if (typeof condition !== 'string') return false;
    const normalized = condition.toLowerCase().replace(/[\s${}]/g, '');
    return normalized === 'false' || normalized === '0' || normalized === 'never';
  });
}

function configuredNonBlocking(node: Record<string, unknown>, fields: string[]): boolean {
  return fields.some((field) => Object.hasOwn(node, field) && node[field] !== false);
}

function invocationMatchesTool(
  invocation: CiInvocation,
  tool: CiTool,
  bindings: RepositoryCommandBindings,
  grammar: CiInvocationGrammar,
): boolean {
  if (invocation.kind === 'action') {
    const action = /^([^@\s]+)@([^@\s]+)$/.exec(invocation.value.trim());
    if (!action) return false;
    const identity = action[1]?.toLowerCase() ?? '';
    return tool.actions.some((action) => action.toLowerCase() === identity);
  }
  return commandTextMatchesTool(
    invocation.value,
    tool,
    bindings,
    new Set(),
    grammar,
    invocation.failFast ?? false,
  );
}

function commandTextMatchesTool(
  value: string,
  tool: CiTool,
  bindings: RepositoryCommandBindings,
  visitedScripts: Set<string>,
  grammar: CiInvocationGrammar,
  failFast = false,
): boolean {
  return shellStatements(value, tool.requires_final_exit_status, failFast).some((statement) => {
    if (
      statement.includes('||') ||
      /(^|[^|])\|(?!\|)/.test(statement) ||
      /(^|[^&])&(?!&)/.test(statement)
    ) {
      return false;
    }
    const commands = statement.split('&&').map((command) => command.trim());
    for (const rawCommand of commands) {
      const command = rawCommand.replace(/^(?:[a-z_][a-z0-9_]*=[^\s]+\s+)*/i, '').trim();
      if (/^(?:false|exit)(?:\s|$)/i.test(command)) return false;
      if (/^(?:cd|chdir|pushd|popd|set-location)\b/i.test(command)) return false;
      if (missingPackageTaskPreventsContinuation(command, bindings, grammar)) return false;
      if (commandMatchesTool(command, tool, bindings, visitedScripts, grammar)) return true;
    }
    return false;
  });
}

function missingPackageTaskPreventsContinuation(
  command: string,
  bindings: RepositoryCommandBindings,
  grammar: CiInvocationGrammar,
): boolean {
  const tokens = command.split(/\s+/).filter(Boolean);
  return tokens.some((token, executableIndex) => {
    if (!['bun', 'npm', 'pnpm', 'yarn'].includes(executableIdentity(token))) return false;
    if (!isSupportedExecutablePosition(tokens, executableIndex, grammar)) return false;
    const invocation = packageScriptInvocation(tokens.slice(executableIndex));
    return invocation !== null && !bindings.packageScripts.has(invocation.task);
  });
}

function commandMatchesTool(
  command: string,
  tool: CiTool,
  bindings: RepositoryCommandBindings,
  visitedScripts: Set<string>,
  grammar: CiInvocationGrammar,
): boolean {
  if (!command || /^(?:echo|printf|write-host|write-output|cat|grep|rg|sed|awk)\b/i.test(command)) {
    return false;
  }
  const tokens = command.split(/\s+/).filter(Boolean);
  if (tokens.some(isNonExecutingCommandArgument)) return false;
  const packageMatch = packageScriptMatchesTool(tokens, tool, bindings, visitedScripts, grammar);
  if (packageMatch !== null) return packageMatch;
  return tokens.some(
    (token, executableIndex) =>
      (tool.standalone_executables.some((executable) =>
        unqualifiedExecutableTokenMatches(token, executable),
      ) ||
        tool.commands.some((signature) =>
          commandExecutableTokenMatches(token, signature, bindings),
        )) &&
      executablePositionMatchesTool(
        tokens,
        executableIndex,
        tool,
        bindings,
        visitedScripts,
        grammar,
      ),
  );
}

function commandExecutableTokenMatches(
  token: string,
  signature: CiTool['commands'][number],
  bindings: RepositoryCommandBindings,
): boolean {
  if (!/[\\/]/.test(token) && !token.startsWith('.')) {
    return signature.executables.some((executable) =>
      unqualifiedExecutableTokenMatches(token, executable),
    );
  }
  const path = normalizeCommandPath(token);
  if (!bindings.availableCommandPaths.has(path)) return false;
  return signature.repository_executables.some(
    (candidate) => normalizeCommandPath(candidate) === path,
  );
}

function unqualifiedExecutableTokenMatches(token: string, executable: string): boolean {
  if (/[\\/]/.test(token) || token.startsWith('.')) return false;
  return executableIdentity(token) === executable.toLowerCase();
}

function executablePositionMatchesTool(
  tokens: string[],
  executableIndex: number,
  tool: CiTool,
  bindings: RepositoryCommandBindings,
  visitedScripts: Set<string>,
  grammar: CiInvocationGrammar,
): boolean {
  if (!isSupportedExecutablePosition(tokens, executableIndex, grammar)) return false;
  const wrappedPackageMatch = packageScriptMatchesTool(
    tokens.slice(executableIndex),
    tool,
    bindings,
    visitedScripts,
    grammar,
  );
  if (wrappedPackageMatch !== null) return wrappedPackageMatch;
  const arguments_ = tokens.slice(executableIndex + 1).map(normalizeCommandArgument);
  const executableToken = tokens[executableIndex] ?? '';
  if (hasProhibitedArguments(tool, arguments_)) return false;
  if (
    tool.standalone_executables.some((standalone) =>
      unqualifiedExecutableTokenMatches(executableToken, standalone),
    )
  )
    return true;
  return tool.commands
    .filter((signature) => commandExecutableTokenMatches(executableToken, signature, bindings))
    .some((signature) => commandSignatureMatches(signature, arguments_, bindings));
}

function isNonExecutingCommandArgument(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    nonExecutingCommandArguments.has(normalized) ||
    normalized.startsWith('--help=') ||
    normalized.startsWith('--version=')
  );
}

function packageScriptMatchesTool(
  tokens: string[],
  tool: CiTool,
  bindings: RepositoryCommandBindings,
  visitedScripts: Set<string>,
  grammar: CiInvocationGrammar,
): boolean | null {
  const managerToken = tokens[0] ?? '';
  if (/[\\/]/.test(managerToken) || managerToken.startsWith('.')) return null;
  const manager = executableIdentity(managerToken);
  if (!['bun', 'npm', 'pnpm', 'yarn'].includes(manager)) return null;
  if (tokens.slice(1).some(isPackageContextOption)) return false;
  const invocation = packageScriptInvocation(tokens);
  if (!invocation) {
    if (manager !== 'npm' || isPackageExecutionWrapper(tokens)) return null;
    const arguments_ = tokens.slice(1);
    const subcommand = arguments_[skipPackageOptions(arguments_, 0)]?.toLowerCase() ?? '';
    return packageManagerDirectToolCommands.get(manager)?.has(subcommand) ? null : false;
  }
  if (invocation.manager === 'bun' && invocation.task === 'test') return null;
  if (invocation.hasForwardedArguments) return false;
  if (visitedScripts.has(invocation.task) || visitedScripts.size >= 4) return false;
  const script = bindings.packageScripts.get(invocation.task);
  if (!script) return false;
  return commandTextMatchesTool(
    script,
    tool,
    bindings,
    new Set(visitedScripts).add(invocation.task),
    grammar,
  );
}

function isPackageExecutionWrapper(tokens: string[]): boolean {
  const arguments_ = tokens.slice(1);
  const index = skipPackageOptions(arguments_, 0);
  return ['dlx', 'exec', 'x'].includes(arguments_[index]?.toLowerCase() ?? '');
}

function isPackageContextOption(value: string): boolean {
  return packageContextOptions.has(value.toLowerCase().split('=')[0] ?? '');
}

function isSupportedExecutablePosition(
  tokens: string[],
  executableIndex: number,
  grammar: CiInvocationGrammar,
): boolean {
  if (executableIndex === 0) return true;
  const wrapper = tokens[0] ?? '';
  const definition = grammar.wrappers.find(({ executable_patterns }) =>
    executable_patterns.some((pattern) => new RegExp(pattern, 'iu').test(wrapper)),
  );
  if (!definition) return false;
  const prefixIndex = wrapperCommandPrefixIndex(tokens, grammar.wrapper_options_with_values);
  return definition.command_prefixes.some(
    (prefix) =>
      executableIndex === prefixIndex + prefix.length &&
      prefix.every(
        (argument, offset) =>
          normalizeCommandArgument(tokens[prefixIndex + offset] ?? '') === argument.toLowerCase(),
      ),
  );
}

function wrapperCommandPrefixIndex(tokens: string[], optionsWithValues: string[]): number {
  const valueOptions = new Set(optionsWithValues.map((option) => option.toLowerCase()));
  let index = 1;
  while (index < tokens.length) {
    const argument = tokens[index]?.toLowerCase() ?? '';
    if (argument === '--') return index + 1;
    if (!argument.startsWith('-')) return index;
    const option = argument.split('=')[0] ?? '';
    index += 1;
    if (!argument.includes('=') && valueOptions.has(option)) index += 1;
  }
  return index;
}

function commandSignatureMatches(
  signature: CiTool['commands'][number],
  arguments_: string[],
  bindings: RepositoryCommandBindings,
): boolean {
  if (hasProhibitedArguments(signature, arguments_)) return false;
  if (signature.max_arguments !== undefined && arguments_.length > signature.max_arguments) {
    return false;
  }
  if (
    signature.required_argument_prefixes.length > 0 &&
    !signature.required_argument_prefixes.some((prefix) =>
      startsWithArgumentSequence(
        arguments_,
        prefix.map((argument) => argument.toLowerCase()),
      ),
    )
  ) {
    return false;
  }
  const argumentsMatch = signature.argument_groups.every((group) =>
    group.some((argument) => commandArgumentMatches(argument, arguments_, bindings)),
  );
  return argumentsMatch && commandSourceMatches(signature, arguments_, bindings);
}

interface ProhibitedCommandArguments {
  prohibited_arguments: string[];
  prohibited_argument_sequences: string[][];
}

function hasProhibitedArguments(
  configuration: ProhibitedCommandArguments,
  arguments_: string[],
): boolean {
  return (
    configuration.prohibited_arguments.some((argument) => {
      const prohibited = argument.toLowerCase();
      return arguments_.some(
        (actual) => actual === prohibited || actual.startsWith(`${prohibited}=`),
      );
    }) ||
    configuration.prohibited_argument_sequences.some((sequence) =>
      containsArgumentSequence(
        arguments_,
        sequence.map((argument) => argument.toLowerCase()),
      ),
    )
  );
}

function commandSourceMatches(
  signature: CiTool['commands'][number],
  arguments_: string[],
  bindings: RepositoryCommandBindings,
): boolean {
  if (
    signature.source_content_groups.length === 0 &&
    signature.source_pattern_groups.length === 0
  ) {
    return true;
  }
  const sourcePaths = signature.argument_groups
    .flat()
    .filter(isRepositoryCommandPath)
    .map(normalizeCommandPath)
    .filter((path) => arguments_.some((argument) => normalizeCommandPath(argument) === path));
  return sourcePaths.some((path) => {
    const source = bindings.commandSources.get(path);
    if (source === undefined) return false;
    const uncommented = stripSourceComments(source, path);
    if (hasObviouslyUnreachableBranch(uncommented, path)) return false;
    const executableSource = executableValidationSource(uncommented, path);
    return (
      sourceGroupsAreCoLocated(
        executableSource,
        signature.source_content_groups,
        signature.source_max_span_lines,
      ) &&
      sourcePatternGroupsAreCoLocated(
        executableSource,
        signature.source_pattern_groups,
        signature.source_max_span_lines,
      )
    );
  });
}

interface SourceFunctionBlock {
  end: number;
  name: string;
  start: number;
}

function executableValidationSource(source: string, path: string): string {
  const lines = source.split(/\r?\n/);
  const blocks = sourceFunctionBlocks(lines, path);
  const reachable = reachableSourceFunctionNames(lines, blocks, path);
  return lines.filter((_, index) => sourceLineIsExecutable(index, blocks, reachable)).join('\n');
}

function sourceLineIsExecutable(
  index: number,
  blocks: SourceFunctionBlock[],
  reachable: Set<string>,
): boolean {
  const containingBlocks = blocks.filter((block) => index >= block.start && index <= block.end);
  return containingBlocks.every((block) => reachable.has(block.name));
}

function reachableSourceFunctionNames(
  lines: string[],
  blocks: SourceFunctionBlock[],
  path: string,
): Set<string> {
  const topLevelLines = topLevelSourceLines(lines, blocks);
  const reachable = new Set(
    blocks
      .filter((block) => sourceFunctionIsCalled(topLevelLines, block.name, path))
      .map(({ name }) => name),
  );
  const pending = [...reachable];
  while (pending.length > 0) {
    const callerName = pending.shift();
    const caller = blocks.find(({ name }) => name === callerName);
    if (!caller) continue;
    const body = sourceFunctionExecutionLines(lines, caller, blocks);
    for (const candidate of blocks) {
      if (reachable.has(candidate.name)) continue;
      if (!sourceFunctionIsCalled(body, candidate.name, path)) continue;
      reachable.add(candidate.name);
      pending.push(candidate.name);
    }
  }
  return reachable;
}

function sourceFunctionExecutionLines(
  lines: string[],
  caller: SourceFunctionBlock,
  blocks: SourceFunctionBlock[],
): string[] {
  return lines.filter(
    (_, index) =>
      index >= caller.start &&
      index <= caller.end &&
      blocks.every(
        (block) =>
          block === caller ||
          index < block.start ||
          index > block.end ||
          block.start < caller.start ||
          block.end > caller.end,
      ),
  );
}

function topLevelSourceLines(lines: string[], blocks: SourceFunctionBlock[]): string[] {
  return lines.filter((_, index) =>
    blocks.every((block) => index < block.start || index > block.end),
  );
}

function sourceFunctionBlocks(lines: string[], path: string): SourceFunctionBlock[] {
  if (/\.py$/i.test(path)) return pythonFunctionBlocks(lines);
  return braceDelimitedFunctionBlocks(lines, /\.[cm]?[jt]sx?$/i.test(path));
}

function braceDelimitedFunctionBlocks(lines: string[], javascript: boolean): SourceFunctionBlock[] {
  const blocks: SourceFunctionBlock[] = [];
  for (let start = 0; start < lines.length; start += 1) {
    const name = sourceFunctionName(lines[start] ?? '', javascript);
    if (!name) continue;
    let depth = unquotedBraceDelta(lines[start] ?? '');
    if (depth <= 0) {
      blocks.push({ end: start, name, start });
      continue;
    }
    for (let end = start + 1; end < lines.length; end += 1) {
      depth += unquotedBraceDelta(lines[end] ?? '');
      if (depth > 0) continue;
      blocks.push({ end, name, start });
      break;
    }
  }
  return blocks.filter(({ name }) => name.length > 0);
}

function sourceFunctionName(line: string, javascript: boolean): string | null {
  if (!javascript) return line.includes('{') ? shellFunctionName(line) : null;
  const declaration = /\bfunction\s+([a-z_$][a-z0-9_$]*)\s*\(/i.exec(line);
  if (declaration && line.includes('{')) return declaration[1] ?? null;
  const assignment = /\b(?:const|let|var)\s+([a-z_$][a-z0-9_$]*)\s*=/i.exec(line);
  if (!assignment) return null;
  const remainder = line.slice(assignment.index + assignment[0].length);
  return remainder.includes('=>') ? (assignment[1] ?? null) : null;
}

function shellFunctionName(line: string): string | null {
  let declaration = line.trim();
  if (declaration.startsWith('function ')) declaration = declaration.slice('function '.length);
  const parentheses = declaration.indexOf('()');
  if (
    parentheses < 1 ||
    !declaration
      .slice(parentheses + 2)
      .trimStart()
      .startsWith('{')
  ) {
    return null;
  }
  const name = declaration.slice(0, parentheses).trim();
  return /^[a-z_][a-z0-9_]*$/i.test(name) ? name : null;
}

function unquotedBraceDelta(line: string): number {
  const quoted = sourceQuotedIndices(line);
  let delta = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (quoted[index] === 1) continue;
    if (line[index] === '{') delta += 1;
    else if (line[index] === '}') delta -= 1;
  }
  return delta;
}

function pythonFunctionBlocks(lines: string[]): SourceFunctionBlock[] {
  const blocks: SourceFunctionBlock[] = [];
  for (let start = 0; start < lines.length; start += 1) {
    const declaration = /^(\s*)def\s+([a-z_]\w*)\s*\(/i.exec(lines[start] ?? '');
    if (!declaration) continue;
    const indentation = (declaration[1] ?? '').length;
    let end = start;
    while (end + 1 < lines.length) {
      const next = lines[end + 1] ?? '';
      if (next.trim().length > 0 && leadingWhitespace(next) <= indentation) break;
      end += 1;
    }
    blocks.push({ end, name: declaration[2] ?? '', start });
  }
  return blocks.filter(({ name }) => name.length > 0);
}

function leadingWhitespace(value: string): number {
  return /^\s*/.exec(value)?.[0].length ?? 0;
}

function sourceFunctionIsCalled(lines: string[], functionName: string, path: string): boolean {
  const name = functionName.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  const callPattern = /\.py$|\.[cm]?[jt]sx?$/i.test(path)
    ? String.raw`(?:^|[^\w$])${name}\s*\(`
    : String.raw`^\s*${name}(?:\s|$)`;
  return lines.some((line) => executableSourcePatternMatches(line, callPattern));
}

function hasObviouslyUnreachableBranch(source: string, path: string): boolean {
  let pattern = String.raw`^\s*if\s+(?:false|\[\s+(?:false|0)\s+\])\s*;?\s*then\b`;
  if (/\.[cm]?[jt]sx?$/i.test(path)) pattern = String.raw`\bif\s*\(\s*(?:false|0)\s*\)`;
  else if (/\.py$/i.test(path)) pattern = String.raw`^\s*if\s+(?:false|0)\s*:`;
  return source.split(/\r?\n/).some((line) => executableSourcePatternMatches(line, pattern));
}

function stripSourceComments(source: string, path: string): string {
  return /\.[cm]?[jt]sx?$/i.test(path) ? stripCStyleComments(source) : stripHashComments(source);
}

function stripCStyleComments(source: string): string {
  let output = '';
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? '';
    const next = source[index + 1] ?? '';
    if (lineComment) {
      const update = cLineCommentUpdate(character);
      lineComment = update.active;
      output += update.output;
      continue;
    }
    if (blockComment) {
      const update = cBlockCommentUpdate(character, next);
      blockComment = update.active;
      output += update.output;
      index += update.advance;
      continue;
    }
    if (quote) {
      const update = quotedSourceUpdate(character, quote, escaped);
      output += quote === '`' && character !== '\n' && update.quote !== '' ? ' ' : character;
      quote = update.quote;
      escaped = update.escaped;
      continue;
    }
    const update = cCodeUpdate(character, next);
    lineComment = update.lineComment;
    blockComment = update.blockComment;
    quote = update.quote;
    output += update.output;
    index += update.advance;
  }
  return output;
}

interface CommentScanUpdate {
  active: boolean;
  advance: number;
  output: string;
}

interface CodeScanUpdate {
  advance: number;
  blockComment: boolean;
  lineComment: boolean;
  output: string;
  quote: string;
}

function cCodeUpdate(character: string, next: string): CodeScanUpdate {
  if (character === '/' && next === '/') {
    return { advance: 1, blockComment: false, lineComment: true, output: '', quote: '' };
  }
  if (character === '/' && next === '*') {
    return { advance: 1, blockComment: true, lineComment: false, output: '', quote: '' };
  }
  return {
    advance: 0,
    blockComment: false,
    lineComment: false,
    output: character,
    quote: ['"', "'", '`'].includes(character) ? character : '',
  };
}

function cLineCommentUpdate(character: string): CommentScanUpdate {
  return character === '\n'
    ? { active: false, advance: 0, output: character }
    : { active: true, advance: 0, output: '' };
}

function cBlockCommentUpdate(character: string, next: string): CommentScanUpdate {
  if (character === '*' && next === '/') return { active: false, advance: 1, output: '' };
  return { active: true, advance: 0, output: character === '\n' ? character : '' };
}

function quotedSourceUpdate(
  character: string,
  quote: string,
  escaped: boolean,
): { escaped: boolean; quote: string } {
  if (escaped) return { escaped: false, quote };
  if (character === '\\') return { escaped: true, quote };
  return { escaped: false, quote: character === quote ? '' : quote };
}

function stripHashComments(source: string): string {
  return source.split(/\r?\n/).map(stripHashComment).join('\n');
}

function stripHashComment(line: string): string {
  let quote = '';
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? '';
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (['"', "'", '`'].includes(character)) quote = character;
    else if (character === '#') return line.slice(0, index);
  }
  return line;
}

function sourceGroupsAreCoLocated(
  source: string,
  groups: string[][],
  maxSpanLines: number,
): boolean {
  const counts = groups.map(() => 0);
  const lines = source.split(/\r?\n/);
  const update = (line: string, direction: 1 | -1) => {
    const normalizedLine = line.toLowerCase();
    groups.forEach((terms, index) => {
      if (terms.some((term) => normalizedLine.includes(term.toLowerCase()))) {
        counts[index] = (counts[index] ?? 0) + direction;
      }
    });
  };
  for (let index = 0; index < lines.length; index += 1) {
    update(lines[index] ?? '', 1);
    if (index >= maxSpanLines) update(lines[index - maxSpanLines] ?? '', -1);
    if (counts.every((count) => count > 0)) return true;
  }
  return false;
}

function sourcePatternGroupsAreCoLocated(
  source: string,
  groups: string[][],
  maxSpanLines: number,
): boolean {
  if (groups.length === 0) return true;
  const counts = groups.map(() => 0);
  const lines = source.split(/\r?\n/);
  const update = (line: string, direction: 1 | -1) => {
    groups.forEach((patterns, index) => {
      if (patterns.some((pattern) => executableSourcePatternMatches(line, pattern))) {
        counts[index] = (counts[index] ?? 0) + direction;
      }
    });
  };
  for (let index = 0; index < lines.length; index += 1) {
    update(lines[index] ?? '', 1);
    if (index >= maxSpanLines) update(lines[index - maxSpanLines] ?? '', -1);
    if (counts.every((count) => count > 0)) return true;
  }
  return false;
}

function executableSourcePatternMatches(line: string, pattern: string): boolean {
  const expression = new RegExp(pattern, 'giu');
  const quoted = sourceQuotedIndices(line);
  for (const match of line.matchAll(expression)) {
    if (quoted[match.index] !== 1) return true;
  }
  return false;
}

function sourceQuotedIndices(line: string): Uint8Array {
  const quoted = new Uint8Array(line.length);
  let quote = '';
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? '';
    if (quote) quoted[index] = 1;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
    } else if (['"', "'", '`'].includes(character)) {
      quote = character;
      quoted[index] = 1;
    }
  }
  return quoted;
}

function commandArgumentMatches(
  argument: string,
  actualArguments: string[],
  bindings: RepositoryCommandBindings,
): boolean {
  const normalizedArgument = argument.toLowerCase();
  const matchesArgument = isRepositoryCommandPath(argument)
    ? actualArguments.some(
        (candidate) => normalizeCommandPath(candidate) === normalizeCommandPath(normalizedArgument),
      )
    : actualArguments.includes(normalizedArgument);
  if (!matchesArgument) return false;
  return (
    !isRepositoryCommandPath(argument) ||
    bindings.availableCommandPaths.has(normalizeCommandPath(argument))
  );
}

function containsArgumentSequence(arguments_: string[], sequence: string[]): boolean {
  return arguments_.some((_, index) =>
    sequence.every((argument, offset) => arguments_[index + offset] === argument),
  );
}

function startsWithArgumentSequence(arguments_: string[], sequence: string[]): boolean {
  return sequence.every((argument, index) => arguments_[index] === argument);
}

function normalizeCommandArgument(value: string): string {
  let normalized = value.toLowerCase();
  const enclosingQuote = normalized[0];
  if (
    normalized.length >= 2 &&
    (enclosingQuote === '"' || enclosingQuote === "'") &&
    normalized.at(-1) === enclosingQuote
  ) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.replace(/=(["'])([^"']*)\1$/, '=$2');
}

function packageScriptInvocation(
  tokens: string[],
): { hasForwardedArguments: boolean; manager: string; task: string } | null {
  const manager = executableIdentity(tokens[0] ?? '');
  if (!['bun', 'npm', 'pnpm', 'yarn'].includes(manager)) return null;
  const arguments_ = tokens.slice(1);
  let index = skipPackageOptions(arguments_, 0);
  const subcommand = arguments_[index]?.toLowerCase() ?? '';
  if (['dlx', 'exec', 'x'].includes(subcommand)) return null;
  if (packageManagerDirectToolCommands.get(manager)?.has(subcommand)) return null;
  if (['run', 'run-script'].includes(subcommand)) {
    index = skipPackageOptions(arguments_, index + 1);
  } else if (manager === 'npm') {
    const implicitTask = npmImplicitScripts.get(subcommand);
    return implicitTask
      ? {
          hasForwardedArguments: hasForwardedPackageArguments(arguments_, index),
          manager,
          task: implicitTask,
        }
      : null;
  }
  const task = packageTaskName(arguments_[index]);
  return task
    ? { hasForwardedArguments: hasForwardedPackageArguments(arguments_, index), manager, task }
    : null;
}

function packageTaskName(value: string | undefined): string | null {
  if (!value) return null;
  const quote = value[0];
  if (value.length >= 2 && ['"', "'"].includes(quote ?? '') && value.at(-1) === quote) {
    return value.slice(1, -1);
  }
  return value;
}

function hasForwardedPackageArguments(arguments_: string[], taskIndex: number): boolean {
  return arguments_.slice(taskIndex + 1).some((argument) => argument !== '--');
}

function skipPackageOptions(arguments_: string[], start: number): number {
  let index = start;
  while (index < arguments_.length) {
    const argument = arguments_[index]?.toLowerCase() ?? '';
    if (argument === '--') {
      index += 1;
      break;
    }
    if (!argument.startsWith('-')) break;
    const option = argument.split('=')[0] ?? '';
    index += 1;
    if (!argument.includes('=') && packageGlobalOptionsWithValues.has(option)) index += 1;
  }
  return index;
}

function executableIdentity(value: string): string {
  return (
    value
      .split('/')
      .at(-1)
      ?.replace(/\.exe$/i, '')
      .toLowerCase() ?? ''
  );
}

function shellStatements(
  value: string,
  requiresFinalExitStatus: boolean,
  failFast = false,
): string[] {
  if (value.includes(';') || hasUnsupportedShellStructure(value)) return [];
  const statements = value
    .split(/\r?\n/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith('#'));
  const terminatingIndex = statements.findIndex(hasUnconditionalShellTermination);
  const reachable = terminatingIndex < 0 ? statements : statements.slice(0, terminatingIndex + 1);
  if (failFast) return reachable;
  if (!requiresFinalExitStatus && reachable.length <= 1) return reachable;
  return reachable.length > 0 ? [reachable.at(-1) ?? ''] : [];
}

function hasUnconditionalShellTermination(value: string): boolean {
  return value
    .split('&&')
    .some((command) =>
      /^(?:[a-z_][a-z0-9_]*=[^\s]+\s+)*(?:exit|return)(?:\s|$)/i.test(command.trim()),
    );
}

function hasUnsupportedShellStructure(value: string): boolean {
  if (value.includes('<<')) return true;
  return value.split(/\r?\n/).some((line) => {
    const trimmed = line.trimEnd();
    return trimmed.endsWith('\\') || trimmed.endsWith('`');
  });
}

function stringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return asArray(value).filter((entry): entry is string => typeof entry === 'string');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function strongestContentMatch(
  text: string,
  terms: string[],
  requiredTerms: string[],
  minTerms: number,
  maxSpanLines?: number,
): { matched: number; requiredMatched: number; qualifies: boolean } {
  if (!maxSpanLines) {
    const matched = terms.filter((term) => containsTerm(text, term)).length;
    const requiredMatched = requiredTerms.filter((term) => containsTerm(text, term)).length;
    return {
      matched,
      requiredMatched,
      qualifies: matched >= minTerms && (requiredTerms.length === 0 || requiredMatched > 0),
    };
  }

  const termCounts = terms.map(() => 0);
  const requiredCounts = requiredTerms.map(() => 0);
  const lines = text.split(/\r?\n/);
  let strongest = 0;
  let strongestRequired = 0;
  let qualifies = false;

  const update = (line: string, direction: 1 | -1) => {
    terms.forEach((term, index) => {
      if (containsTerm(line, term)) termCounts[index] = (termCounts[index] ?? 0) + direction;
    });
    requiredTerms.forEach((term, index) => {
      if (containsTerm(line, term)) {
        requiredCounts[index] = (requiredCounts[index] ?? 0) + direction;
      }
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    update(lines[index] ?? '', 1);
    if (index >= maxSpanLines) update(lines[index - maxSpanLines] ?? '', -1);
    const matched = termCounts.filter((count) => count > 0).length;
    const requiredMatched = requiredCounts.filter((count) => count > 0).length;
    strongest = Math.max(strongest, matched);
    strongestRequired = Math.max(strongestRequired, requiredMatched);
    if (matched >= minTerms && (requiredTerms.length === 0 || requiredMatched > 0)) {
      qualifies = true;
    }
  }

  return { matched: strongest, requiredMatched: strongestRequired, qualifies };
}

function containsTerm(text: string, term: string): boolean {
  const pattern = termPattern(term);
  return new RegExp(`(^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, 'i').test(text);
}

function containsPositiveTerm(text: string, term: string): boolean {
  const pattern = termPattern(term);
  const expression = new RegExp(`(^|[^a-z0-9])(${pattern})(?=$|[^a-z0-9])`, 'gi');
  for (const match of text.matchAll(expression)) {
    const termStart = match.index + (match[1]?.length ?? 0);
    const prefix = containingClausePrefix(text, termStart);
    const suffix = containingClauseSuffix(text, termStart + (match[2]?.length ?? 0));
    if (
      !hasNegativePrefix(prefix) &&
      !hasNegativeSuffix(suffix) &&
      !hasExplicitlyUnboundedQualifier(prefix, suffix) &&
      !hasPlaceholderQualifier(prefix, suffix) &&
      !hasNonHumanAuthorityPrefix(prefix, term)
    ) {
      return true;
    }
  }
  return false;
}

function hasExplicitlyUnboundedQualifier(prefix: string, suffix: string): boolean {
  const precedingQualifier = /\b(?:unbounded|unlimited)(?:\s+[a-z0-9_-]+){0,2}\s*$/i.test(prefix);
  const followingQualifier =
    /^\s*(?:(?:is|are|remains?|stays?|=|:)\s*)?(?:explicitly\s+)?(?:unbounded|unlimited)\b/i.test(
      suffix,
    );
  return precedingQualifier || followingQualifier;
}

function hasPlaceholderQualifier(prefix: string, suffix: string): boolean {
  return hasPrecedingPlaceholder(prefix) || hasFollowingPlaceholder(suffix);
}

function normalizedQualifierPhrase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replaceAll(' / ', '/')
    .replaceAll('/ ', '/')
    .replaceAll(' /', '/');
}

function hasPrecedingPlaceholder(prefix: string): boolean {
  const normalized = normalizedQualifierPhrase(prefix);
  for (const placeholder of semanticPlaceholderQualifiers) {
    const index = normalized.lastIndexOf(placeholder);
    if (index < 0) continue;
    const preceding = normalized[index - 1] ?? '';
    if (/[a-z0-9_]/i.test(preceding)) continue;
    const trailingWords = normalized
      .slice(index + placeholder.length)
      .trim()
      .split(/\s+/);
    if (trailingWords.length <= 2 && trailingWords.every(isQualifierBridgeWord)) return true;
  }
  return false;
}

function isQualifierBridgeWord(value: string): boolean {
  return value.length === 0 || /^[a-z0-9_-]+$/i.test(value);
}

function hasFollowingPlaceholder(suffix: string): boolean {
  let normalized = normalizedQualifierPhrase(suffix);
  for (const link of [
    'remains ',
    'remain ',
    'stays ',
    'stay ',
    'are ',
    'is ',
    '= ',
    '=',
    ': ',
    ':',
  ]) {
    if (!normalized.startsWith(link)) continue;
    normalized = normalized.slice(link.length).trimStart();
    break;
  }
  if (normalized.startsWith('explicitly ')) normalized = normalized.slice('explicitly '.length);
  return semanticPlaceholderQualifiers.some(
    (placeholder) => normalized === placeholder || normalized.startsWith(`${placeholder} `),
  );
}

function hasNonHumanAuthorityPrefix(prefix: string, term: string): boolean {
  if (!/\b(?:maintainers?|owners?|reviewers?)\b/i.test(term)) return false;
  return /\b(?:ai|agents?|bots?|automated|automation)\s+$/i.test(prefix);
}

function hasNegativePrefix(value: string): boolean {
  const normalized = withoutRestrictiveUpperBound(value);
  const negativeWord =
    /\b(?:cannot|forbidden|lacks?|lacking|missing|never|no|not|prohibited|without)\b/i.test(
      normalized,
    );
  const negativeModal = /\b(?:can|do|does|may|must)\s+not\b/i.test(normalized);
  return negativeWord || negativeModal;
}

function hasNegativeSuffix(value: string): boolean {
  const normalized = withoutRestrictiveUpperBound(value);
  const negativeWord =
    /\b(?:absent|cannot|forbidden|lacking|missing|never|not|prohibited|unavailable|without)\b/i.test(
      normalized,
    );
  return negativeWord || /:\s*none\b/i.test(normalized);
}

function withoutRestrictiveUpperBound(value: string): string {
  return value.replace(/\b(?:cannot|may not|must not|shall not|should not)\s+exceed\b/gi, '');
}

function containingClausePrefix(text: string, end: number): string {
  const before = text.slice(0, end);
  const boundaries = [...before.matchAll(/[.;\n]|\bbut\b/gi)];
  const lastBoundary = boundaries.at(-1);
  return before.slice(lastBoundary ? lastBoundary.index + lastBoundary[0].length : 0);
}

function containingClauseSuffix(text: string, start: number): string {
  const after = text.slice(start);
  const boundary = /[.;\n]|\bbut\b/i.exec(after);
  return after.slice(0, boundary?.index ?? after.length);
}

function termPattern(term: string): string {
  return term
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s_-]+');
}

async function evaluateMaxBytes(
  context: RepositoryContext,
  check: Extract<EvidenceCheck, { type: 'max_bytes' }>,
) {
  const paths = await matches(context, check.patterns);
  let total = 0;
  const inspected: string[] = [];
  for (const path of paths) {
    const size = await safeFileSize(context.metadata.root, path);
    if (size === null) continue;
    total += size;
    inspected.push(path);
  }
  const passed = inspected.length > 0 && total <= check.max_bytes;
  return result(
    check.type,
    check.scope,
    passed ? 'met' : 'not_met',
    `${total} byte(s) across ${inspected.length} safe matching file(s); maximum ${check.max_bytes}`,
    inspected,
  );
}

function result(
  type: EvidenceCheck['type'],
  scope: EvidenceScope,
  status: EvidenceResult['status'],
  summary: string,
  references: string[],
): EvidenceResult {
  return { type, scope, status, summary, references };
}

async function evaluateCheck(
  context: RepositoryContext,
  check: EvidenceCheck,
): Promise<EvidenceResult> {
  switch (check.type) {
    case 'path_any':
      return evaluatePathAny(context, check);
    case 'path_all':
      return evaluatePathAll(context, check);
    case 'ownership_map':
      return evaluateOwnershipMap(context, check);
    case 'content_any':
    case 'content_all':
      return evaluateLegacyContent(context, check);
    case 'content_terms':
      return evaluateContentTerms(context, check);
    case 'content_groups':
      return evaluateContentGroups(context, check);
    case 'ci_command':
      return evaluateCiCommand(context, check);
    case 'max_bytes':
      return evaluateMaxBytes(context, check);
    case 'manual':
      return result('manual', check.scope, 'unknown', check.prompt, []);
  }
}

function activeAttestation(
  control: Control,
  attestations: AttestationFile | null,
  now: Date,
): Attestation | null {
  if (!control.allow_attestation) return null;
  const attestation = attestations?.attestations[control.id];
  if (!attestation) return null;
  if (attestation.expires_at && new Date(attestation.expires_at) < now) return null;
  if (attestation.status === 'not_applicable' && !control.allow_not_applicable) return null;
  return attestation;
}

function activeAgentEvidence(
  control: Control,
  claim: AgentEvidenceClaim | null,
  now: Date,
): AgentEvidenceClaim | null {
  if (!claim || !control.allow_agent_evidence) return null;
  if (new Date(claim.expires_at) < now) return null;
  return claim;
}

interface ControlResolution {
  confidence: ControlResult['confidence'];
  status: ControlResult['status'];
}

function evidenceChecksPass(control: Control, evidence: EvidenceResult[]): boolean {
  return control.evidence_mode === 'any'
    ? evidence.some(({ status }) => status === 'met')
    : evidence.every(({ status }) => status === 'met');
}

function repositoryEvidencePasses(
  control: Control,
  evidence: EvidenceResult[],
  checksPassed: boolean,
): boolean {
  const hasRepositoryMatch = evidence.some(
    ({ scope, status }) => scope === 'repository' && status === 'met',
  );
  const hasManualCheck = control.evidence.some(({ type }) => type === 'manual');
  return checksPassed && hasRepositoryMatch && (!hasManualCheck || control.evidence_mode === 'any');
}

function externalEvidenceConflicts(
  attestation: Attestation | null,
  agentEvidence: AgentEvidenceClaim | null,
): boolean {
  const attestationStatus =
    attestation?.status === 'unknown' ? null : (attestation?.status ?? null);
  return (
    agentEvidence !== null &&
    agentEvidence.status !== 'unknown' &&
    attestationStatus !== null &&
    agentEvidence.status !== attestationStatus
  );
}

function supplementalResolution(
  attestation: Attestation | null,
  agentEvidence: AgentEvidenceClaim | null,
): ControlResolution | null {
  if (externalEvidenceConflicts(attestation, agentEvidence)) {
    return { confidence: 'none', status: 'unknown' };
  }
  if (agentEvidence && agentEvidence.status !== 'unknown') {
    return { confidence: 'agent-collected', status: agentEvidence.status };
  }
  if (attestation) return { confidence: 'attested', status: attestation.status };
  if (agentEvidence?.status === 'unknown') {
    return { confidence: 'agent-collected', status: 'unknown' };
  }
  return null;
}

function alternativeSupplementalResolution(
  evidence: EvidenceResult[],
  attestation: Attestation | null,
  agentEvidence: AgentEvidenceClaim | null,
): ControlResolution {
  if (attestation?.status === 'not_applicable') {
    return { confidence: 'attested', status: 'not_applicable' };
  }
  const statuses = evidence.map(({ status }) => status);
  const sources: Array<ControlResolution['confidence'] | null> = evidence.map(() => null);
  const agentIndexes = matchingAlternativeIndexes(evidence, agentEvidence?.scope ?? null);
  const attestationIndexes = manualAlternativeIndexes(evidence);
  if (
    alternativeSupplementalEvidenceConflicts(
      evidence,
      attestationIndexes,
      attestation,
      agentEvidence,
    )
  ) {
    return { confidence: 'none', status: 'unknown' };
  }

  applyAlternativeStatus(
    statuses,
    sources,
    agentIndexes,
    agentEvidence?.status ?? null,
    'agent-collected',
  );
  applyAlternativeStatus(
    statuses,
    sources,
    attestationIndexes,
    attestation?.status ?? null,
    'attested',
  );

  if (statuses.includes('met')) {
    return { confidence: decisiveAlternativeConfidence(statuses, sources, 'met'), status: 'met' };
  }
  if (statuses.every((status) => status === 'not_met')) {
    return {
      confidence: decisiveAlternativeConfidence(statuses, sources, 'not_met'),
      status: 'not_met',
    };
  }
  return { confidence: 'none', status: 'unknown' };
}

function matchingAlternativeIndexes(
  evidence: EvidenceResult[],
  scope: EvidenceScope | null,
): number[] {
  if (scope === null) return [];
  return evidence.flatMap(({ scope: candidate }, index) => (candidate === scope ? [index] : []));
}

function manualAlternativeIndexes(evidence: EvidenceResult[]): number[] {
  return evidence.flatMap(({ type }, index) => (type === 'manual' ? [index] : []));
}

function alternativeSupplementalEvidenceConflicts(
  evidence: EvidenceResult[],
  attestationIndexes: number[],
  attestation: Attestation | null,
  agentEvidence: AgentEvidenceClaim | null,
): boolean {
  if (!agentEvidence || agentEvidence.status === 'unknown') return false;
  if (!attestation || ['not_applicable', 'unknown'].includes(attestation.status)) return false;
  const sameAlternative = attestationIndexes.some(
    (index) => evidence[index]?.scope === agentEvidence.scope,
  );
  return sameAlternative && agentEvidence.status !== attestation.status;
}

function applyAlternativeStatus(
  statuses: EvidenceResult['status'][],
  sources: Array<ControlResolution['confidence'] | null>,
  indexes: number[],
  status: Attestation['status'] | AgentEvidenceClaim['status'] | null,
  source: Exclude<ControlResolution['confidence'], 'none' | 'repository-detected'>,
): void {
  if (status === null || status === 'not_applicable') return;
  for (const index of indexes) {
    statuses[index] = status;
    sources[index] = source;
  }
}

function decisiveAlternativeConfidence(
  statuses: EvidenceResult['status'][],
  sources: Array<ControlResolution['confidence'] | null>,
  decisiveStatus: 'met' | 'not_met',
): ControlResolution['confidence'] {
  const decisiveSources = sources.filter(
    (source, index) => statuses[index] === decisiveStatus && source !== null,
  );
  if (decisiveSources.includes('agent-collected')) return 'agent-collected';
  if (decisiveSources.includes('attested')) return 'attested';
  return 'none';
}

function resolveControl(
  control: Control,
  evidence: EvidenceResult[],
  attestation: Attestation | null,
  agentEvidence: AgentEvidenceClaim | null,
): ControlResolution {
  const checksPassed = evidenceChecksPass(control, evidence);
  if (repositoryEvidencePasses(control, evidence, checksPassed)) {
    return { confidence: 'repository-detected', status: 'met' };
  }
  if (control.evidence_mode === 'any') {
    return alternativeSupplementalResolution(evidence, attestation, agentEvidence);
  }
  const supplemental = supplementalResolution(attestation, agentEvidence);
  if (supplemental) return supplemental;
  const hasUnknownCheck = evidence.some(({ status }) => status === 'unknown');
  if (hasUnknownCheck) return { confidence: 'none', status: 'unknown' };
  return { confidence: 'none', status: checksPassed ? 'met' : 'not_met' };
}

export async function evaluateControl(
  context: RepositoryContext,
  control: Control,
  attestations: AttestationFile | null,
  agentClaim: AgentEvidenceClaim | null,
  now = new Date(),
): Promise<ControlResult> {
  const evidence = await Promise.all(
    control.evidence.map(async (check) => evaluateCheck(context, check)),
  );
  const attestation = activeAttestation(control, attestations, now);
  const agentEvidence = activeAgentEvidence(control, agentClaim, now);
  const { confidence, status } = resolveControl(control, evidence, attestation, agentEvidence);

  return {
    id: control.id,
    dimension: control.dimension,
    level: control.level,
    title: control.title,
    outcome: control.outcome,
    risk: control.risk,
    status,
    confidence,
    ...(control.evidence_mode === 'any' ? { evidence_mode: 'any' as const } : {}),
    evidence,
    agent_evidence: agentEvidence,
    attestation,
    remediation: control.remediation,
  };
}
