import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import fg from 'fast-glob';

import type {
  Attestation,
  AttestationFile,
  Control,
  ControlResult,
  EvidenceCheck,
  EvidenceResult,
} from './schema.js';

const ignored = ['**/.git/**', '**/node_modules/**', '**/dist/**', '**/coverage/**'];
const maxContentFileBytes = 512_000;
const maxContentFiles = 250;
const maxContentTotalBytes = 5_000_000;

async function matches(repo: string, patterns: string[]): Promise<string[]> {
  return (
    await fg(patterns, {
      cwd: repo,
      dot: true,
      onlyFiles: false,
      unique: true,
      followSymbolicLinks: false,
      ignore: ignored,
    })
  ).sort();
}

async function evaluatePathAny(repo: string, check: Extract<EvidenceCheck, { type: 'path_any' }>) {
  const found = await matches(repo, check.patterns);
  return result(
    check.type,
    found.length > 0 ? 'met' : 'not_met',
    `${found.length} matching path(s)`,
    found,
  );
}

async function evaluatePathAll(repo: string, check: Extract<EvidenceCheck, { type: 'path_all' }>) {
  const groups = await Promise.all(check.patterns.map(async (pattern) => matches(repo, [pattern])));
  const missing = check.patterns.filter((_, index) => groups[index]?.length === 0);
  const found = [...new Set(groups.flat())].sort();
  return result(
    check.type,
    missing.length === 0 ? 'met' : 'not_met',
    missing.length === 0
      ? 'Every required path pattern matched'
      : `Missing patterns: ${missing.join(', ')}`,
    found,
  );
}

async function readSearchableFiles(
  repo: string,
  patterns: string[],
): Promise<Array<{ path: string; text: string }>> {
  const root = await realpath(repo);
  const paths = (await matches(repo, patterns)).slice(0, maxContentFiles);
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
        metadata.size > maxContentFileBytes ||
        totalBytes + metadata.size > maxContentTotalBytes
      ) {
        continue;
      }
      totalBytes += metadata.size;
      files.push({ path, text: (await readFile(canonicalPath, 'utf8')).toLowerCase() });
    } catch {
      // Races, unreadable files, and binary content are treated as unavailable evidence.
    }
  }
  return files;
}

async function evaluateContent(
  repo: string,
  check: Extract<EvidenceCheck, { type: 'content_any' | 'content_all' }>,
): Promise<EvidenceResult> {
  const files = await readSearchableFiles(repo, check.files);
  const matchedNeedles = check.needles.filter((needle) =>
    files.some(({ text }) => text.includes(needle.toLowerCase())),
  );
  const passed =
    check.type === 'content_any'
      ? matchedNeedles.length > 0
      : matchedNeedles.length === check.needles.length;
  return result(
    check.type,
    passed ? 'met' : 'not_met',
    `Matched ${matchedNeedles.length}/${check.needles.length} required term(s) across ${files.length} file(s)`,
    files.map(({ path }) => path),
  );
}

async function evaluateMaxBytes(
  repo: string,
  check: Extract<EvidenceCheck, { type: 'max_bytes' }>,
) {
  const paths = await matches(repo, check.patterns);
  const root = await realpath(repo);
  let total = 0;
  let inspected = 0;
  for (const path of paths) {
    const requestedPath = resolve(root, path);
    if ((await lstat(requestedPath)).isSymbolicLink()) continue;
    const canonicalPath = await realpath(requestedPath);
    if (canonicalPath !== root && !canonicalPath.startsWith(`${root}${sep}`)) continue;
    total += (await stat(canonicalPath)).size;
    inspected += 1;
  }
  const passed = inspected > 0 && total <= check.max_bytes;
  return result(
    check.type,
    passed ? 'met' : 'not_met',
    `${total} byte(s) across ${inspected} safe matching file(s); maximum ${check.max_bytes}`,
    paths,
  );
}

function result(
  type: EvidenceCheck['type'],
  status: EvidenceResult['status'],
  summary: string,
  references: string[],
): EvidenceResult {
  return { type, status, summary, references };
}

async function evaluateCheck(repo: string, check: EvidenceCheck): Promise<EvidenceResult> {
  switch (check.type) {
    case 'path_any':
      return evaluatePathAny(repo, check);
    case 'path_all':
      return evaluatePathAll(repo, check);
    case 'content_any':
    case 'content_all':
      return evaluateContent(repo, check);
    case 'max_bytes':
      return evaluateMaxBytes(repo, check);
    case 'manual':
      return result('manual', 'unknown', check.prompt, []);
  }
}

function activeAttestation(
  control: Control,
  attestations: AttestationFile | null,
  now: Date,
): Attestation | null {
  const attestation = attestations?.attestations[control.id];
  if (!attestation) return null;
  if (attestation.expires_at && new Date(attestation.expires_at) < now) return null;
  if (attestation.status === 'not_applicable' && !control.allow_not_applicable) return null;
  return attestation;
}

export async function evaluateControl(
  repo: string,
  control: Control,
  attestations: AttestationFile | null,
  now = new Date(),
): Promise<ControlResult> {
  const evidence = await Promise.all(
    control.evidence.map(async (check) => evaluateCheck(repo, check)),
  );
  const attestation = activeAttestation(control, attestations, now);
  const checksPassed = evidence.every(({ status }) => status === 'met');
  const hasManualCheck = control.evidence.some(({ type }) => type === 'manual');

  let status: ControlResult['status'] = checksPassed ? 'met' : 'not_met';
  let confidence: ControlResult['confidence'] =
    checksPassed && !hasManualCheck ? 'verified' : 'none';

  if (attestation?.status === 'not_applicable') {
    status = 'not_applicable';
    confidence = 'attested';
  } else if (attestation?.status === 'met' && control.allow_attestation) {
    status = 'met';
    confidence = checksPassed && !hasManualCheck ? 'verified' : 'attested';
  } else if (attestation?.status === 'not_met' || attestation?.status === 'unknown') {
    status = attestation.status;
    confidence = 'attested';
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
    evidence,
    attestation,
    remediation: control.remediation,
  };
}

export function repositoryLabel(repo: string, cwd = process.cwd()): string {
  const label = relative(cwd, repo);
  return label === '' ? '.' : label;
}
