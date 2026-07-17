#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import { stringify } from 'yaml';

import { loadAttestations, loadBenchmark } from './load.js';
import { toMarkdown } from './report.js';
import type { EvidenceCheck } from './schema.js';
import { assess } from './score.js';

const program = new Command();

program
  .name('agentic-scorecard')
  .description('Evidence-backed readiness assessment for agentic software development harnesses')
  .version('0.1.0');

program
  .command('validate')
  .description('Validate the bundled benchmark catalog')
  .action(async () => {
    const { benchmark, controls } = await loadBenchmark();
    process.stdout.write(
      `Valid ${benchmark.id} v${benchmark.version}: ${controls.length} controls across ${benchmark.dimensions.length} dimensions.\n`,
    );
  });

program
  .command('explain')
  .argument('<control-id>', 'ADRB control id')
  .description('Explain one control and its evidence rules')
  .action(async (controlId: string) => {
    const { controls } = await loadBenchmark();
    const control = controls.find(({ id }) => id === controlId.toUpperCase());
    if (!control) throw new Error(`Unknown control: ${controlId}`);
    process.stdout.write(
      `${control.id} — ${control.title}\nDimension: ${control.dimension}; level: ${control.level}\n\nOutcome: ${control.outcome}\nRisk: ${control.risk}\nRemediation: ${control.remediation}\n\nEvidence:\n${control.evidence.map((check) => `- ${stringify(check).trim().replaceAll('\n', '\n  ')}`).join('\n')}\n`,
    );
  });

program
  .command('init')
  .argument('[repository]', 'repository to initialize', '.')
  .option('--force', 'replace an existing attestation file', false)
  .description('Create a manual-attestation template')
  .action(async (repository: string, options: { force: boolean }) => {
    const repo = resolve(repository);
    const path = join(repo, '.agentic', 'attestations.yaml');
    if (!options.force) {
      try {
        await readFile(path, 'utf8');
        throw new Error(`${path} already exists; use --force to replace it`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    const { benchmark, controls } = await loadBenchmark();
    const attestations = Object.fromEntries(
      controls
        .filter((control) => control.evidence.some(({ type }) => type === 'manual'))
        .map((control) => {
          const manualCheck = control.evidence.find(
            (check): check is Extract<EvidenceCheck, { type: 'manual' }> => check.type === 'manual',
          );
          return [
            control.id,
            {
              status: 'unknown',
              evidence: `TODO: ${manualCheck?.prompt ?? control.outcome}`,
              owner: 'TODO',
              reviewed_at: new Date().toISOString().slice(0, 10),
              expires_at: null,
            },
          ];
        }),
    );
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      `# Claims are visible as attested, never tool-verified. Link durable evidence; do not paste secrets.\n${stringify({ benchmark_version: benchmark.version, attestations })}`,
      'utf8',
    );
    process.stdout.write(`Created ${path}\n`);
  });

program
  .command('assess')
  .argument('[repository]', 'repository to assess', '.')
  .option('--profile <profile>', 'target autonomy profile', 'pr-creation')
  .option('--format <format>', 'json or markdown', 'markdown')
  .option('--output <path>', 'write the report to a file')
  .option('--attestations <path>', 'manual attestation file')
  .option('--enforce', 'exit non-zero when the target profile fails', false)
  .option('--github-output', 'append summary values to $GITHUB_OUTPUT', false)
  .description('Assess a repository using local, read-only evidence collection')
  .action(
    async (
      repository: string,
      options: {
        profile: string;
        format: string;
        output?: string;
        attestations?: string;
        enforce: boolean;
        githubOutput: boolean;
      },
    ) => {
      if (!['json', 'markdown'].includes(options.format)) {
        throw new Error('--format must be json or markdown');
      }
      const repo = resolve(repository);
      const { benchmark, controls } = await loadBenchmark();
      const attestationPath = resolve(
        options.attestations ?? join(repo, '.agentic', 'attestations.yaml'),
      );
      const attestations = await loadAttestations(attestationPath, benchmark.version);
      const report = await assess(repo, benchmark, controls, options.profile, attestations);
      const output =
        options.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : toMarkdown(report);

      let reportPath: string | null = null;
      if (options.output) {
        reportPath = resolve(options.output);
        await mkdir(dirname(reportPath), { recursive: true });
        await writeFile(reportPath, output, 'utf8');
        process.stdout.write(`Wrote ${reportPath}\n`);
      } else {
        process.stdout.write(output);
      }

      if (options.githubOutput) {
        const githubOutput = process.env.GITHUB_OUTPUT;
        if (!githubOutput) throw new Error('$GITHUB_OUTPUT is unavailable');
        await appendFile(
          githubOutput,
          `score=${report.score.total}\npercentage=${report.score.percentage}\nhighest_profile=${report.readiness.highest_profile ?? 'none'}\ntarget_passed=${String(report.readiness.target_passed)}\nreport_path=${reportPath ?? ''}\n`,
          'utf8',
        );
      }

      if (options.enforce && !report.readiness.target_passed) process.exitCode = 2;
    },
  );

await program.parseAsync();
