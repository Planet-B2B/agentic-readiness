import type { AssessmentReport, ControlResult } from './schema.js';

const statusIcon: Record<ControlResult['status'], string> = {
  met: 'PASS',
  not_met: 'FAIL',
  unknown: 'UNKNOWN',
  not_applicable: 'N/A',
};

export function toMarkdown(report: AssessmentReport): string {
  const target = report.profiles.find(({ id }) => id === report.target.profile);
  const lines = [
    '# Agentic Development Readiness Assessment',
    '',
    `- Benchmark: ${report.benchmark.id} v${report.benchmark.version}`,
    `- Repository: \`${report.target.repository}\``,
    `- Assessed: ${report.assessed_at}`,
    `- Score: **${report.score.total}/${report.score.maximum} (${report.score.percentage}%)**`,
    `- Highest readiness profile: **${report.readiness.highest_profile ?? 'none'}**`,
    `- Target \`${report.target.profile}\`: **${report.readiness.target_passed ? 'PASS' : 'FAIL'}**`,
    `- Evidence: ${report.evidence_summary.verified} verified, ${report.evidence_summary.attested} attested, ${report.evidence_summary.unmet_or_unknown} unmet/unknown`,
    '',
    '## Dimensions',
    '',
    '| Dimension | Score | Controls met |',
    '| --- | ---: | ---: |',
    ...report.dimensions.map(
      ({ title, score, controls_met: met, controls_total: total }) =>
        `| ${title} | ${score}/4 | ${met}/${total} |`,
    ),
  ];

  if (target && !target.passed) {
    lines.push('', '## Target-profile blockers', '');
    for (const blocker of target.blockers) {
      lines.push(
        `- **${blocker.dimension}:** ${blocker.actual}/4; requires ${blocker.required}/4 (${blocker.control_ids.join(', ') || 'lower-level gap'})`,
      );
    }
  }

  lines.push('', '## Controls requiring action', '');
  const actionControls = report.controls.filter(
    ({ status }) => status === 'not_met' || status === 'unknown',
  );
  if (actionControls.length === 0) {
    lines.push('None.');
  } else {
    for (const control of actionControls) {
      lines.push(
        `### ${statusIcon[control.status]} ${control.id} — ${control.title}`,
        '',
        `**Risk:** ${control.risk}`,
        '',
        `**Improve:** ${control.remediation}`,
        '',
        `Evidence confidence: ${control.confidence}.`,
        '',
      );
    }
  }

  lines.push(
    '## Limitations',
    '',
    ...report.limitations.map((limitation) => `- ${limitation}`),
    '',
  );
  return lines.join('\n');
}
