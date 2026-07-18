import type { AssessmentReport, ControlResult, EvidenceScope } from './schema.js';

const statusIcon: Record<ControlResult['status'], string> = {
  met: 'PASS',
  not_met: 'FAIL',
  unknown: 'UNKNOWN',
  not_applicable: 'N/A',
};

function controlScope(control: ControlResult): EvidenceScope {
  return control.evidence.find(({ scope }) => scope !== 'repository')?.scope ?? 'repository';
}

function safeText(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/([\\`*_[\]<>|])/g, '\\$1');
}

function sentence(value: string): string {
  const safe = safeText(value);
  return /[.!?]$/.test(safe) ? safe : `${safe}.`;
}

function references(values: string[]): string {
  return values.map((value) => `\`${value.replaceAll('`', "'").replace(/\s+/g, ' ')}\``).join(', ');
}

function evidenceLines(control: ControlResult): string[] {
  const lines = control.evidence.flatMap((evidence) => {
    const evidenceReferences =
      evidence.references.length > 0 ? ` References: ${references(evidence.references)}.` : '';
    return `- **${evidence.scope}/${evidence.type}:** ${evidence.status} — ${sentence(evidence.summary)}${evidenceReferences}`;
  });
  if (control.agent_evidence) {
    lines.push(
      `- **Agent-collected:** ${control.agent_evidence.status} — ${sentence(control.agent_evidence.summary)} References: ${references(control.agent_evidence.references)}.`,
    );
  }
  if (control.attestation) {
    lines.push(
      `- **Human-attested:** ${control.attestation.status} — ${references([control.attestation.evidence])} (owner: ${safeText(control.attestation.owner)}; reviewed: ${control.attestation.reviewed_at}).`,
    );
  }
  if (
    control.agent_evidence &&
    control.attestation &&
    control.agent_evidence.status !== 'unknown' &&
    control.attestation.status !== 'unknown' &&
    control.agent_evidence.status !== control.attestation.status
  ) {
    lines.push(
      '- **Conflict:** agent-collected and human-attested statuses disagree; fail closed.',
    );
  }
  return lines;
}

function confidenceRule(control: ControlResult): string {
  if (control.confidence !== 'none') return '';
  return control.evidence_mode === 'any'
    ? ' — one evidence alternative must pass'
    : ' — all required evidence checks must pass';
}

function appendControlDetails(
  lines: string[],
  heading: string,
  controls: ControlResult[],
  showCheckSummary: boolean,
): void {
  lines.push('', `## ${heading}`, '');
  if (controls.length === 0) {
    lines.push('None.');
    return;
  }
  for (const control of controls) {
    const establishedChecks = control.evidence.filter(({ status }) => status === 'met').length;
    const blockingChecks = control.evidence.flatMap(({ scope, status, type }, index) =>
      status === 'met' ? [] : [`#${index + 1} ${scope}/${type}`],
    );
    const blockingSummary = blockingChecks.map((check) => `\`${check}\``).join(', ');
    const checkSummary =
      control.evidence_mode === 'any'
        ? `Alternative evidence checks established: ${establishedChecks}/${control.evidence.length}; one required.`
        : `Required evidence checks established: ${establishedChecks}/${control.evidence.length}.`;
    const blockingLabel =
      control.evidence_mode === 'any' ? 'Unresolved alternatives' : 'Blocking checks';
    const confidenceExplanation = confidenceRule(control);
    lines.push(
      `### ${statusIcon[control.status]} ${control.id} — ${control.title}`,
      '',
      `**Risk:** ${control.risk}`,
      '',
      `**Improve:** ${control.remediation}`,
      '',
      ...(showCheckSummary
        ? [
            checkSummary,
            ...(blockingChecks.length > 0 ? [`${blockingLabel}: ${blockingSummary}.`] : []),
            `Control confidence: ${control.confidence}${confidenceExplanation}.`,
          ]
        : [`Evidence confidence: ${control.confidence}.`]),
      '',
      ...evidenceLines(control),
      '',
    );
  }
}

export function toMarkdown(report: AssessmentReport): string {
  const showCheckSummary = report.benchmark.version === '0.4.0';
  const target = report.profiles.find(({ id }) => id === report.target.profile);
  const targetDependencies = target?.evidence_dependencies;
  const dependencyCount =
    (targetDependencies?.agent_collected ?? 0) + (targetDependencies?.attested ?? 0);
  const targetProvenance =
    target?.passed && dependencyCount > 0
      ? ` (depends on ${[
          targetDependencies?.agent_collected
            ? `${targetDependencies.agent_collected} agent-collected`
            : null,
          targetDependencies?.attested ? `${targetDependencies.attested} human-attested` : null,
        ]
          .filter(Boolean)
          .join(' and ')} required ${dependencyCount === 1 ? 'control' : 'controls'})`
      : '';
  const established = report.controls.filter(
    ({ status }) => status === 'met' || status === 'not_applicable',
  );
  const unresolved = report.controls.filter(
    ({ status }) => status === 'not_met' || status === 'unknown',
  );
  const alternativeControls = unresolved.filter(({ evidence_mode: mode }) => mode === 'any');
  const requiredControls = unresolved.filter(({ evidence_mode: mode }) => mode !== 'any');
  const repositoryGaps = requiredControls.filter(
    (control) => controlScope(control) === 'repository',
  );
  const externalControls = requiredControls.filter((control) =>
    ['platform', 'organization'].includes(controlScope(control)),
  );
  const outcomeControls = requiredControls.filter((control) => controlScope(control) === 'outcome');
  const repositoryOnlyBaseline = !report.controls.some(
    ({ agent_evidence: agentEvidence, attestation }) =>
      agentEvidence !== null || attestation !== null,
  );
  const resolvedEvidence =
    report.evidence_summary.resolved !== undefined && report.evidence_summary.total !== undefined
      ? `; ${report.evidence_summary.resolved}/${report.evidence_summary.total} controls resolved`
      : '';

  const lines = [
    '# Agentic Development Readiness Assessment',
    '',
    `- Benchmark: ${report.benchmark.id} v${report.benchmark.version}`,
    `- Repository: \`${report.target.repository}\``,
    `- Assessment scope: **${report.target.scope}**`,
    `- Git commit: ${report.target.git_head ? `\`${report.target.git_head}\`` : 'unavailable'}`,
    `- Working tree dirty: ${report.target.working_tree_dirty === null ? 'unknown' : String(report.target.working_tree_dirty)}`,
    `- Assessed: ${report.assessed_at}`,
    ...(repositoryOnlyBaseline
      ? [
          '- Assessment mode: **repository-only baseline** — platform, organization, and outcome evidence has not been established',
        ]
      : ['- Assessment mode: **evidence-assisted assessment**']),
    ...(report.score.repository
      ? [
          `- Repository-detected progress: **${report.score.repository.achieved}/${report.score.repository.ceiling} (${report.score.repository.percentage}%)** of the maturity levels the offline repository collector can establish`,
        ]
      : []),
    `- Normative readiness score: **${report.score.total}/${report.score.maximum} (${report.score.percentage}%)**`,
    `- Highest readiness profile: **${report.readiness.highest_profile ?? 'none'}**`,
    `- Target \`${report.target.profile}\`: **${report.readiness.target_passed ? `PASS${targetProvenance}` : 'FAIL'}**`,
    `- Established evidence: ${report.evidence_summary.repository_detected} repository-detected, ${report.evidence_summary.agent_collected} agent-collected, ${report.evidence_summary.attested} human-attested; ${report.evidence_summary.unmet} unmet, ${report.evidence_summary.unknown} unknown${resolvedEvidence}`,
    ...(report.warnings && report.warnings.length > 0
      ? [`- Warnings: **${report.warnings.length} — review before using this assessment**`]
      : []),
    '',
    ...(report.warnings && report.warnings.length > 0
      ? [
          '## Warnings',
          '',
          ...report.warnings.map((warning) => `- WARNING: ${safeText(warning)}`),
          '',
        ]
      : []),
    '## Dimensions',
    '',
    '| Dimension | Score | Controls met |',
    '| --- | ---: | ---: |',
    ...report.dimensions.map(
      ({ title, score, controls_met: met, controls_total: total }) =>
        `| ${title} | ${score}/4 | ${met}/${total} |`,
    ),
    '',
    '> A dimension earns only consecutive levels. Controls met above the first gap remain visible but do not increase its score.',
  ];

  if (target && !target.passed) {
    lines.push('', '## Target-profile blockers', '');
    for (const blocker of target.blockers) {
      lines.push(
        `- **${blocker.dimension}:** ${blocker.actual}/4; requires ${blocker.required}/4 (${blocker.control_ids.join(', ') || 'lower-level gap'})`,
      );
    }
  }

  lines.push('', '## Established controls', '');
  if (established.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| Control | Level | Evidence scope | Confidence |', '| --- | ---: | --- | --- |');
    for (const control of established) {
      lines.push(
        `| ${control.id} — ${control.title.replaceAll('|', '\\|')} | ${control.level} | ${controlScope(control)} | ${control.confidence} |`,
      );
    }
  }

  appendControlDetails(lines, 'Repository evidence gaps', repositoryGaps, showCheckSummary);
  appendControlDetails(
    lines,
    'Alternative evidence paths not established',
    alternativeControls,
    showCheckSummary,
  );
  appendControlDetails(
    lines,
    'External controls not established',
    externalControls,
    showCheckSummary,
  );
  appendControlDetails(
    lines,
    'Outcome evidence not established',
    outcomeControls,
    showCheckSummary,
  );

  lines.push(
    '',
    '## Limitations',
    '',
    ...report.limitations.map((limitation) => `- ${limitation}`),
    '',
  );
  return lines.join('\n');
}
