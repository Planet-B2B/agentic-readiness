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
    const header = markdownCells(lines[index] ?? '');
    const separator = markdownCells(lines[index + 1] ?? '');
    if (header.length < 2 || separator.length !== header.length) continue;
    if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const scopeIndex = header.findIndex((cell) =>
      /\b(path|component|module|area|scope|repository)\b/.test(cell),
    );
    const ownerIndex = header.findIndex((cell) =>
      /\b(owner|reviewer|maintainer|team)\b/.test(cell),
    );
    if (scopeIndex < 0 || ownerIndex < 0) continue;
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const row = markdownCells(lines[rowIndex] ?? '');
      if (row.length !== header.length) break;
      const scope = row[scopeIndex] ?? '';
      const owner = row[ownerIndex] ?? '';
      if (scope.length > 0 && isOwnerReference(owner)) entries += 1;
    }
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
    const mapping = line.match(/^[-*]?\s*([^:=>]{1,100})\s*(?::|=>|->)\s*(.{1,120})$/);
    if (!mapping) return false;
    const target = mapping[1]?.trim() ?? '';
    const owner = mapping[2]?.trim() ?? '';
    const targetLooksScoped =
      /[/*._-]/.test(target) || /\b(component|module|area|repository|scope)\b/.test(target);
    return targetLooksScoped && isOwnerReference(owner);
  }).length;
}

function isOwnerReference(value: string): boolean {
  const normalized = value
    .replace(/^[-*]\s*/, '')
    .replace(/[*_`]/g, '')
    .trim();
  if (isPlaceholderOwner(normalized)) return false;
  if (isOwnerContact(normalized)) return true;
  const namedRole = normalized.match(/^(.{2,80})\s+(?:team|owners?|reviewers?|maintainers?)$/i);
  if (namedRole) return !isPlaceholderOwner(namedRole[1] ?? '');
  const roleAssignment = normalized.match(
    /^(?:owner|reviewer|maintainer|team)\s*[:=-]\s*(.{2,80})$/i,
  );
  return roleAssignment ? !isPlaceholderOwner(roleAssignment[1] ?? '') : false;
}

function isConventionalOwnerListEntry(value: string): boolean {
  const normalized = value.replace(/^[-*]\s*/, '').trim();
  return !isPlaceholderOwner(normalized) && isOwnerContact(normalized);
}

function isOwnerContact(value: string): boolean {
  return /(^|\s)@[a-z0-9][a-z0-9_/-]*/i.test(value) || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value);
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
    const matchedGroups = groups
      .filter(({ terms }) => terms.some((term) => containsTerm(text, term)))
      .map(({ id }) => id);
    return { matchedGroups, qualifies: matchedGroups.length >= minGroups };
  }

  const groupCounts = groups.map(() => 0);
  const lines = text.split(/\r?\n/);
  let strongestGroups: string[] = [];

  const update = (line: string, direction: 1 | -1) => {
    groups.forEach(({ terms }, index) => {
      if (terms.some((term) => containsTerm(line, term))) {
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
  const files = await readSearchableFiles(context, check.files, check.max_files_per_pattern);
  const inspected = files.map(({ path, text }) => {
    const invocations = ciIntegrationInvocations(path, text);
    const matchedTerms = check.terms.filter((term) =>
      invocations.some((invocation) => invocationMatchesTerm(invocation, term)),
    );
    return { path, matchedTerms };
  });
  const qualifying = inspected.filter(({ matchedTerms }) => matchedTerms.length >= check.min_terms);
  const strongest = inspected.reduce(
    (maximum, candidate) =>
      candidate.matchedTerms.length > maximum.matchedTerms.length ? candidate : maximum,
    { path: '', matchedTerms: [] as string[] },
  );
  return result(
    check.type,
    check.scope,
    qualifying.length > 0 ? 'met' : 'not_met',
    `${qualifying.length} CI configuration file(s) contain an enabled integration-triggered scanner invocation; strongest executable match ${strongest.matchedTerms.length}/${check.terms.length} term(s) across ${files.length} candidate file(s); threshold ${check.min_terms}`,
    qualifying.map(({ path }) => path),
  );
}

interface CiInvocation {
  kind: 'action' | 'command';
  value: string;
}

function ciIntegrationInvocations(path: string, text: string): CiInvocation[] {
  try {
    const document = asRecord(parse(text, { maxAliasCount: 50 }));
    if (!document) return [];
    const normalizedPath = path.toLowerCase();
    if (normalizedPath.startsWith('.github/workflows/')) {
      return githubIntegrationInvocations(document);
    }
    if (normalizedPath.includes('gitlab-ci')) {
      return gitlabIntegrationInvocations(document);
    }
    return azureIntegrationInvocations(document);
  } catch {
    return [];
  }
}

function githubIntegrationInvocations(document: Record<string, unknown>): CiInvocation[] {
  if (!hasNamedTrigger(document.on, ['pull_request', 'merge_group'])) return [];
  const jobs = asRecord(document.jobs);
  if (!jobs) return [];
  const invocations: CiInvocation[] = [];
  for (const jobValue of Object.values(jobs)) {
    const job = asRecord(jobValue);
    if (!job || isDisabledCiNode(job)) continue;
    if (typeof job.uses === 'string') invocations.push({ kind: 'action', value: job.uses });
    for (const stepValue of asArray(job.steps)) {
      const step = asRecord(stepValue);
      if (!step || isDisabledCiNode(step)) continue;
      if (typeof step.uses === 'string') invocations.push({ kind: 'action', value: step.uses });
      if (typeof step.run === 'string') invocations.push({ kind: 'command', value: step.run });
    }
  }
  return invocations;
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
    if (!job || isDisabledCiNode(job) || job.allow_failure === true) continue;
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
  if (isDisabledCiNode(node)) return [];
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
  return record ? names.some((name) => Object.hasOwn(record, name)) : false;
}

function hasGitlabMergeRequestRule(value: unknown): boolean {
  return asArray(value).some((ruleValue) => {
    const rule = asRecord(ruleValue);
    if (!rule || isDisabledCiNode(rule)) return false;
    return typeof rule.if === 'string' && rule.if.toLowerCase().includes('merge_request_event');
  });
}

function hasAzurePullRequestTrigger(value: unknown): boolean {
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === 'string') return !['none', 'false'].includes(value.toLowerCase());
  if (Array.isArray(value)) return value.length > 0;
  return asRecord(value) !== null;
}

function isDisabledCiNode(node: Record<string, unknown>): boolean {
  if (
    node.enabled === false ||
    node['continue-on-error'] === true ||
    node.continueonerror === true
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

function invocationMatchesTerm(invocation: CiInvocation, term: string): boolean {
  if (invocation.kind === 'action') return containsTerm(invocation.value, term);
  return shellStatements(invocation.value).some((statement) => {
    const command = statement.replace(/^(?:[a-z_][a-z0-9_]*=[^\s]+\s+)*/i, '').trim();
    if (
      !command ||
      /^(?:echo|printf|write-host|write-output|cat|grep|rg|sed|awk)\b/i.test(command)
    ) {
      return false;
    }
    const executable = command.split(/\s+/, 1)[0] ?? '';
    if (containsTerm(executable, term)) return true;
    return /^(?:bash|bun|docker|node|npm|npx|pipx|pnpm|pwsh|python|sh|sudo|uvx|yarn)\b/i.test(
      executable,
    )
      ? containsTerm(command, term)
      : false;
  });
}

function shellStatements(value: string): string[] {
  return value
    .split(/\r?\n|&&|\|\||;/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith('#'));
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
  const pattern = term
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s_-]+');
  return new RegExp(`(^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, 'i').test(text);
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
  const checksPassed =
    control.evidence_mode === 'any'
      ? evidence.some(({ status }) => status === 'met')
      : evidence.every(({ status }) => status === 'met');
  const hasManualCheck = control.evidence.some(({ type }) => type === 'manual');
  const repositoryPass =
    checksPassed &&
    evidence.some(
      ({ scope, status: evidenceStatus }) => scope === 'repository' && evidenceStatus === 'met',
    ) &&
    (!hasManualCheck || control.evidence_mode === 'any');

  let status: ControlResult['status'] = checksPassed ? 'met' : 'not_met';
  let confidence: ControlResult['confidence'] = repositoryPass ? 'repository-detected' : 'none';
  const attestationStatus =
    attestation?.status === 'unknown' ? null : (attestation?.status ?? null);
  const hasExternalConflict =
    agentEvidence !== null &&
    agentEvidence.status !== 'unknown' &&
    attestationStatus !== null &&
    agentEvidence.status !== attestationStatus;

  if (repositoryPass) {
    // Repository evidence is the strongest class emitted by the offline scanner.
  } else if (hasExternalConflict) {
    status = 'unknown';
    confidence = 'none';
  } else if (agentEvidence && agentEvidence.status !== 'unknown') {
    status = agentEvidence.status;
    confidence = 'agent-collected';
  } else if (attestation?.status === 'not_applicable') {
    status = 'not_applicable';
    confidence = 'attested';
  } else if (attestation?.status === 'met') {
    status = 'met';
    confidence = 'attested';
  } else if (attestation?.status === 'not_met' || attestation?.status === 'unknown') {
    status = attestation.status;
    confidence = 'attested';
  } else if (agentEvidence?.status === 'unknown') {
    status = 'unknown';
    confidence = 'agent-collected';
  } else if (evidence.some(({ status: checkStatus }) => checkStatus === 'unknown')) {
    status = 'unknown';
  }

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
