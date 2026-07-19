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

async function matches(context: RepositoryContext, patterns: string[]): Promise<string[]> {
  const found = await fg(patterns, {
    cwd: context.metadata.root,
    dot: true,
    onlyFiles: true,
    unique: true,
    followSymbolicLinks: false,
    ignore: generatedEvidenceIgnores,
  });
  return found
    .filter((path) => context.includedPaths === null || context.includedPaths.has(path))
    .filter((path) => !context.excludedPaths.has(path))
    .sort();
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
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (name === 'codeowners') {
    return lines.filter((line) => {
      const fields = line.split(/\s+/);
      return fields.length >= 2 && fields.slice(1).some(isOwnerContact);
    }).length;
  }

  if (['owners', 'owners.md', 'maintainers', 'maintainers.md'].includes(name)) {
    return lines.filter(isConventionalOwnerListEntry).length;
  }

  return markdownOwnershipRows(lines) + explicitOwnershipMappings(lines);
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
    if (isOwnershipTarget(scope) && isOwnerReference(owner)) entries += 1;
  }
  return entries;
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
  if (/^(?:all files|default|entire repository|global|repo|repository|root)$/i.test(target)) {
    return true;
  }
  if (/^(?:area|component|module|path|scope)\s+\S+/i.test(target)) return true;
  if (/^(?:\.{0,2}\/|\/)/.test(target) || /[/*]/.test(target)) return true;
  return /^[a-z0-9_.-]+\.[a-z0-9]{1,10}$/i.test(target);
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
  if (isPlaceholderOwner(normalized)) return false;
  if (isOwnerContact(normalized)) return true;
  const namedRole = namedOwnerRolePattern.exec(normalized);
  if (namedRole) return !isPlaceholderOwner(namedRole[1] ?? '');
  const roleAssignment = ownerRoleAssignmentPattern.exec(normalized);
  return roleAssignment ? !isPlaceholderOwner(roleAssignment[1] ?? '') : false;
}

function isConventionalOwnerListEntry(value: string): boolean {
  const normalized = value.replace(/^[-*]\s*/, '').trim();
  return !isPlaceholderOwner(normalized) && isOwnerContact(normalized);
}

function isOwnerContact(value: string): boolean {
  return /(^|\s)@[a-z0-9][a-z0-9_/-]*/i.test(value) || hasEmailContact(value);
}

function hasEmailContact(value: string): boolean {
  return value.split(/\s+/).some((token) => {
    const at = token.indexOf('@');
    const dot = token.indexOf('.', at + 2);
    return at > 0 && dot > at + 1 && dot < token.length - 1;
  });
}

function isPlaceholderOwner(value: string): boolean {
  return /^(?:tbd|to be (?:assigned|determined)|unassigned|n\/?a|none|unknown|pending|vacant|-+)$/i.test(
    value,
  );
}

async function readSearchableFiles(
  context: RepositoryContext,
  patterns: string[],
  maxFilesPerPattern?: number,
): Promise<Array<{ path: string; text: string }>> {
  const root = context.metadata.root;
  const paths = maxFilesPerPattern
    ? await prioritizedMatches(context, patterns, maxFilesPerPattern)
    : (await matches(context, patterns)).slice(0, maxContentFiles);
  const files: Array<{ path: string; text: string }> = [];
  let totalBytes = 0;
  for (const path of paths) {
    try {
      const requestedPath = resolve(root, path);
      if ((await lstat(requestedPath)).isSymbolicLink()) continue;
      const canonicalPath = await realpath(requestedPath);
      if (canonicalPath !== root && !canonicalPath.startsWith(`${root}${sep}`)) continue;
      const metadata = await stat(canonicalPath);
      if (
        !metadata.isFile() ||
        metadata.size === 0 ||
        metadata.size > maxContentFileBytes ||
        totalBytes + metadata.size > maxContentTotalBytes
      ) {
        continue;
      }
      const text = (await readFile(canonicalPath, 'utf8')).toLowerCase();
      if (isGeneratedAssessment(text)) continue;
      totalBytes += metadata.size;
      files.push({ path, text });
    } catch {
      // Races, unreadable files, and binary content are unavailable evidence.
    }
  }
  return files;
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
  if (normalized.startsWith('# agentic development readiness assessment')) return true;
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
  const patterns = check.providers.flatMap(({ files }) => files);
  const files = await readSearchableFiles(context, patterns, check.max_files_per_pattern);
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
    const matchedTools = check.tools.filter((tool) =>
      invocations.some((invocation) => invocationMatchesTool(invocation, tool)),
    );
    return { path, matchedTools };
  });
  const qualifying = inspected.filter(({ matchedTools }) => matchedTools.length >= check.min_tools);
  const strongest = inspected.reduce(
    (maximum, candidate) =>
      candidate.matchedTools.length > maximum.matchedTools.length ? candidate : maximum,
    { path: '', matchedTools: [] as typeof check.tools },
  );
  return result(
    check.type,
    check.scope,
    qualifying.length > 0 ? 'met' : 'not_met',
    `${qualifying.length} CI configuration file(s) contain an enabled integration-triggered scanner invocation; strongest scanner match ${strongest.matchedTools.length}/${check.tools.length} recognized tool(s) across ${files.length} candidate file(s); threshold ${check.min_tools}`,
    qualifying.map(({ path }) => path),
  );
}

interface CiInvocation {
  kind: 'action' | 'command';
  value: string;
}

type CiProviderId = Extract<EvidenceCheck, { type: 'ci_command' }>['providers'][number]['id'];
type CiTool = Extract<EvidenceCheck, { type: 'ci_command' }>['tools'][number];

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
  return Object.values(jobs).flatMap((job) => githubJobInvocations(job, events));
}

function githubJobInvocations(value: unknown, parentEvents: Set<string>): CiInvocation[] {
  const job = asRecord(value);
  if (!job || isDisabledCiNode(job)) return [];
  const events = githubConditionEvents(job.if, parentEvents);
  if (events.size === 0) return [];
  const steps = asArray(job.steps);
  if (steps.length === 0 || !hasGithubRunner(job['runs-on'])) return [];
  return steps.flatMap((step) => githubStepInvocations(step, events));
}

function hasGithubRunner(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return (
    Array.isArray(value) && value.some((entry) => typeof entry === 'string' && entry.length > 0)
  );
}

function githubStepInvocations(value: unknown, parentEvents: Set<string>): CiInvocation[] {
  const step = asRecord(value);
  if (!step || isDisabledCiNode(step)) return [];
  if (githubConditionEvents(step.if, parentEvents).size === 0) return [];
  const action = invocationFromField(step, 'uses', 'action');
  const command = invocationFromField(step, 'run', 'command');
  return [action, command].filter((invocation): invocation is CiInvocation => invocation !== null);
}

function invocationFromField(
  node: Record<string, unknown>,
  field: string,
  kind: CiInvocation['kind'],
): CiInvocation | null {
  const value = node[field];
  return typeof value === 'string' ? { kind, value } : null;
}

function gitlabIntegrationInvocations(document: Record<string, unknown>): CiInvocation[] {
  const workflow = asRecord(document.workflow);
  const workflowAllowsMergeRequests = hasGitlabMergeRequestRule(workflow?.rules);
  const reserved = new Set([
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
  const invocations: CiInvocation[] = [];
  for (const [name, jobValue] of Object.entries(document)) {
    if (name.startsWith('.') || reserved.has(name)) continue;
    const job = asRecord(jobValue);
    if (!job || isDisabledCiNode(job)) continue;
    if (hasNamedTrigger(job.except, ['merge_requests'])) continue;
    const hasJobTriggerRules = asArray(job.rules).length > 0 || job.only !== undefined;
    const jobAllowsMergeRequests =
      hasGitlabMergeRequestRule(job.rules) || hasNamedTrigger(job.only, ['merge_requests']);
    if (hasJobTriggerRules ? !jobAllowsMergeRequests : !workflowAllowsMergeRequests) continue;
    for (const command of stringValues(job.script)) {
      invocations.push({ kind: 'command', value: command });
    }
  }
  return invocations;
}

function azureIntegrationInvocations(document: Record<string, unknown>): CiInvocation[] {
  if (!hasAzurePullRequestTrigger(document.pr)) return [];
  return collectAzureInvocations(document);
}

function collectAzureInvocations(node: Record<string, unknown>): CiInvocation[] {
  if (isDisabledCiNode(node) || !azureConditionAllowsPullRequest(node.condition)) return [];
  const invocations: CiInvocation[] = [];
  for (const field of ['script', 'bash', 'pwsh', 'powershell', 'command'] as const) {
    if (typeof node[field] === 'string') {
      invocations.push({ kind: 'command', value: node[field] });
    }
  }
  for (const collection of ['stages', 'jobs', 'steps'] as const) {
    for (const childValue of asArray(node[collection])) {
      const child = asRecord(childValue);
      if (child) invocations.push(...collectAzureInvocations(child));
    }
  }
  return invocations;
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
  if (!trigger || trigger.types === undefined) return trigger !== null;
  const types = stringValues(trigger.types).map((type) => type.toLowerCase());
  const requiredTypes =
    name === 'pull_request' ? ['opened', 'reopened', 'synchronize'] : ['checks_requested'];
  return requiredTypes.every((type) => types.includes(type));
}

function githubConditionEvents(value: unknown, parentEvents: Set<string>): Set<string> {
  if (value === undefined || value === true) return new Set(parentEvents);
  if (typeof value !== 'string') return new Set();
  const condition = value.toLowerCase();
  const normalized = condition.replace(/[\s${}]/g, '');
  if (!condition.includes('github.event_name')) {
    return ['true', 'always()', 'success()', '!cancelled()'].includes(normalized)
      ? new Set(parentEvents)
      : new Set();
  }
  const equals = [...condition.matchAll(/github\.event_name\s*==\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? '',
  );
  const excludes = [...condition.matchAll(/github\.event_name\s*!=\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? '',
  );
  if (equals.length === 0 && excludes.length === 0) return new Set();
  const unsupported = condition
    .replace(/github\.event_name\s*(?:==|!=)\s*['"][^'"]+['"]/g, '')
    .replace(/\b(?:always|success|cancelled)\(\)/g, '')
    .replace(/[\s${}()!&|]/g, '');
  if (unsupported.length > 0) return new Set();
  const candidates =
    equals.length > 0 ? equals.filter((event) => parentEvents.has(event)) : [...parentEvents];
  return new Set(candidates.filter((event) => !excludes.includes(event)));
}

function hasGitlabMergeRequestRule(value: unknown): boolean {
  for (const ruleValue of asArray(value)) {
    const rule = asRecord(ruleValue);
    if (!rule) return false;
    if (typeof rule.if !== 'string') return !isDisabledCiNode(rule);
    const comparison = /^\s*\$?ci_pipeline_source\s*(==|!=)\s*['"]([^'"]+)['"]\s*$/i.exec(rule.if);
    if (!comparison) return false;
    const operator = comparison[1];
    const event = comparison[2]?.toLowerCase();
    const matchesMergeRequest =
      operator === '==' ? event === 'merge_request_event' : event !== 'merge_request_event';
    if (matchesMergeRequest) return !isDisabledCiNode(rule);
  }
  return false;
}

function hasAzurePullRequestTrigger(value: unknown): boolean {
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === 'string') return !['none', 'false'].includes(value.toLowerCase());
  if (Array.isArray(value)) return value.length > 0;
  const trigger = asRecord(value);
  if (!trigger) return false;
  const branches = asRecord(trigger.branches);
  if (!branches) return true;
  const include = stringValues(branches.include).map((branch) => branch.toLowerCase());
  const exclude = stringValues(branches.exclude).map((branch) => branch.toLowerCase());
  if (exclude.includes('*')) return false;
  if (include.length > 0) return include.some((branch) => !['none', 'false'].includes(branch));
  return true;
}

function azureConditionAllowsPullRequest(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const condition = value.toLowerCase().replace(/\s+/g, '');
  if (['always()', 'succeeded()', 'succeededorfailed()'].includes(condition)) return true;
  const direct = azureReasonComparison(condition);
  if (direct !== null) return direct;
  const conjunction = /^and\((?:always|succeeded|succeededorfailed)\(\),(.+)\)$/.exec(condition);
  return conjunction ? azureReasonComparison(conjunction[1] ?? '') === true : false;
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

function invocationMatchesTool(invocation: CiInvocation, tool: CiTool): boolean {
  if (invocation.kind === 'action') {
    const identity = invocation.value.split('@', 1)[0]?.toLowerCase() ?? '';
    return tool.actions.some((action) => action.toLowerCase() === identity);
  }
  return shellStatements(invocation.value).some((statement) => {
    if (statement.includes('||') || /(^|[^|])\|(?!\|)/.test(statement)) return false;
    const commands = statement.split('&&').map((command) => command.trim());
    for (const rawCommand of commands) {
      const command = rawCommand.replace(/^(?:[a-z_][a-z0-9_]*=[^\s]+\s+)*/i, '').trim();
      if (/^(?:false|exit\s+[1-9]\d*)$/i.test(command)) return false;
      if (commandMatchesTool(command, tool)) return true;
    }
    return false;
  });
}

function commandMatchesTool(command: string, tool: CiTool): boolean {
  if (!command || /^(?:echo|printf|write-host|write-output|cat|grep|rg|sed|awk)\b/i.test(command)) {
    return false;
  }
  const tokens = command.split(/\s+/).filter(Boolean);
  const executableIndex = tokens.findIndex((token) =>
    tool.executables.some((executable) => executableIdentity(token) === executable.toLowerCase()),
  );
  if (executableIndex < 0) return false;
  if (executableIndex > 0) {
    const wrapper = tokens[0] ?? '';
    const supportedWrapper = /^(?:npx|pipx|sudo|uvx)$/i.test(wrapper);
    const wrapperArgumentsAreOptions = tokens
      .slice(1, executableIndex)
      .every((token) => token.startsWith('-'));
    if (!supportedWrapper || !wrapperArgumentsAreOptions) return false;
  }
  const arguments_ = tokens.slice(executableIndex + 1).map((token) => token.toLowerCase());
  return tool.scan_arguments.some((argument) => arguments_.includes(argument.toLowerCase()));
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

function shellStatements(value: string): string[] {
  if (value.includes(';')) return [];
  const statements = value
    .split(/\r?\n/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith('#'));
  return statements.length > 0 ? [statements.at(-1) ?? ''] : [];
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
    if (!/\b(?:cannot|never|no|not)\b|\b(?:can|do|does|may|must)\s+not\b/i.test(prefix)) {
      return true;
    }
  }
  return false;
}

function containingClausePrefix(text: string, end: number): string {
  const before = text.slice(0, end);
  const boundaries = [...before.matchAll(/[.;:\n]|\bbut\b/gi)];
  const lastBoundary = boundaries.at(-1);
  return before.slice(lastBoundary ? lastBoundary.index + lastBoundary[0].length : 0);
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
