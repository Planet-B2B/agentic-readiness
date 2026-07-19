#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import { stringify } from 'yaml';

import { loadAgentEvidence, loadAttestations, loadBenchmark } from './load.js';
import { toMarkdown } from './report.js';
import { createRepositoryContext, repositoryEvidenceTarget } from './repository.js';
import type { AssessmentScope, EvidenceCheck } from './schema.js';
import { assess } from './score.js';

const program = new Command();

program
  .name('agentic-scorecard')
  .description('Evidence-backed readiness assessment for agentic software development harnesses')
  .version('0.4.0');

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
    const context = await createRepositoryContext(repo, 'workspace');
    const target = { repository: repositoryEvidenceTarget(context.metadata).repository };
    const reviewedAt = new Date();
    const expiresAt = new Date(reviewedAt);
    expiresAt.setDate(expiresAt.getDate() + 90);
    const attestations = Object.fromEntries(
      controls
        .filter(
          (control) =>
            control.allow_attestation && control.evidence.some(({ type }) => type === 'manual'),
        )
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
              reviewed_at: reviewedAt.toISOString().slice(0, 10),
              expires_at: expiresAt.toISOString().slice(0, 10),
            },
          ];
        }),
    );
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      `# Claims are visibly human-attested. Link durable evidence; do not paste secrets.\n${stringify({ benchmark_version: benchmark.version, target, attestations })}`,
      'utf8',
    );
    process.stdout.write(`Created ${path}\n`);
  });

program
  .command('init-evidence')
  .argument('[repository]', 'repository to prepare external evidence for', '.')
  .option('--output <path>', 'agent evidence bundle path')
  .option('--request-output <path>', 'human-readable evidence request path')
  .option('--force', 'replace an existing agent evidence bundle', false)
  .description('Create a target-bound template for unresolved agent-collected evidence')
  .action(
    async (
      repository: string,
      options: { output?: string; requestOutput?: string; force: boolean },
    ) => {
      const repo = resolve(repository);
      const path = resolve(options.output ?? join(repo, '.agentic', 'agent-evidence.yaml'));
      const requestPath = resolve(
        options.requestOutput ?? join(repo, '.agentic', 'evidence-request.md'),
      );
      if (path === requestPath) {
        throw new Error('Agent evidence bundle and request paths must be different');
      }
      if (!options.force) {
        for (const candidate of [path, requestPath]) {
          try {
            await readFile(candidate, 'utf8');
            throw new Error(`${candidate} already exists; use --force to replace it`);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }
      }
      const { benchmark, controls } = await loadBenchmark();
      const context = await createRepositoryContext(repo, 'tracked').catch((error: unknown) => {
        if (
          error instanceof Error &&
          error.message.startsWith('Tracked assessment requires a Git worktree')
        ) {
          throw new Error(
            'init-evidence requires a Git worktree with a commit so the bundle can be target-bound.',
          );
        }
        throw error;
      });
      if (!context.metadata.git_head) {
        throw new Error(
          'init-evidence requires a Git commit so the bundle can be target-bound. Commit the assessed state and try again.',
        );
      }
      if (context.metadata.tracked_tree_dirty) {
        throw new Error(
          'init-evidence requires tracked files to match HEAD so every claim binds to the exact assessed commit.',
        );
      }
      const baseline = await assess(repo, benchmark, controls, 'read-only-analysis', {
        scope: 'tracked',
      });
      const unresolved = new Set(
        baseline.controls
          .filter(({ status }) => status !== 'met' && status !== 'not_applicable')
          .map(({ id }) => id),
      );
      const eligibleControls = controls.filter(
        ({ allow_agent_evidence: allowed, id }) => allowed && unresolved.has(id),
      );
      const bundle = {
        schema_version: benchmark.version,
        benchmark_version: benchmark.version,
        target: repositoryEvidenceTarget(context.metadata),
        collector: { name: 'TODO: agent or adapter name', version: 'TODO' },
        claims: {},
      };
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path,
        `# Use authorized read-only tools. Do not paste secrets or raw sensitive content.\n${stringify(bundle)}`,
        'utf8',
      );
      await mkdir(dirname(requestPath), { recursive: true });
      await writeFile(
        requestPath,
        [
          `# ADRB v${benchmark.version} evidence request`,
          '',
          `- Repository: ${bundle.target.repository}`,
          `- Git commit: ${bundle.target.git_head ?? 'unavailable'}`,
          `- Benchmark: ${benchmark.version}`,
          '',
          'Repository claims may cite only tracked paths from the bound commit and remain agent-collected, not repository-detected. Obtain authorization before accessing connected systems. Use read-only, least-privileged tools. Add only attempted claims to the bundle; partial or inconclusive evidence remains `unknown`. Never paste source excerpts, secrets, prompts, personal data, or raw sensitive content.',
          '',
          ...eligibleControls.flatMap((control) => {
            const manualCheck = control.evidence.find(
              (check): check is Extract<EvidenceCheck, { type: 'manual' }> =>
                check.type === 'manual',
            );
            const scopes =
              control.agent_evidence_scopes.length > 0
                ? control.agent_evidence_scopes
                : [manualCheck?.scope ?? 'organization'];
            return [
              `## ${control.id} — ${control.title}`,
              '',
              `- Scope: ${scopes.join(', ')}`,
              `- Request: ${manualCheck?.prompt ?? control.outcome}`,
              `- Risk: ${control.risk}`,
              '',
            ];
          }),
        ].join('\n'),
        'utf8',
      );
      process.stdout.write(`Created ${path}\nCreated ${requestPath}\n`);
    },
  );

program
  .command('assess')
  .argument('[repository]', 'repository to assess', '.')
  .option('--profile <profile>', 'target autonomy profile', 'pr-creation')
  .option('--format <format>', 'json or markdown', 'markdown')
  .option('--output <path>', 'write the report to a file')
  .option('--attestations <path>', 'manual attestation file')
  .option('--agent-evidence <path>', 'agent-collected repository or external evidence bundle')
  .option('--scope <scope>', 'tracked or workspace', 'tracked')
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
        agentEvidence?: string;
        scope: string;
        enforce: boolean;
        githubOutput: boolean;
      },
    ) => {
      if (!['json', 'markdown'].includes(options.format)) {
        throw new Error('--format must be json or markdown');
      }
      if (!['tracked', 'workspace'].includes(options.scope)) {
        throw new Error('--scope must be tracked or workspace');
      }
      const repo = resolve(repository);
      const { benchmark, controls } = await loadBenchmark();
      const warnings: string[] = [];
      const attestationPath = resolve(
        options.attestations ?? join(repo, '.agentic', 'attestations.yaml'),
      );
      const attestations = await loadAttestations(attestationPath, benchmark.version, {
        ignoreVersionMismatch: options.attestations === undefined,
        onWarning: (warning) => warnings.push(warning),
      });
      const agentEvidencePath = resolve(
        options.agentEvidence ?? join(repo, '.agentic', 'agent-evidence.yaml'),
      );
      const agentEvidence = await loadAgentEvidence(agentEvidencePath, benchmark.version, {
        ignoreVersionMismatch: options.agentEvidence === undefined,
        onWarning: (warning) => warnings.push(warning),
      });
      const reportPath = options.output ? resolve(options.output) : null;
      const report = await assess(repo, benchmark, controls, options.profile, {
        scope: options.scope as AssessmentScope,
        attestations,
        agentEvidence,
        warnings,
        excludedPaths: [attestationPath, agentEvidencePath, ...(reportPath ? [reportPath] : [])],
      });
      const output =
        options.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : toMarkdown(report);

      if (reportPath) {
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
          `score=${report.score.total}\npercentage=${report.score.percentage}\nrepository_score=${report.score.repository?.achieved ?? ''}\nrepository_ceiling=${report.score.repository?.ceiling ?? ''}\nrepository_percentage=${report.score.repository?.percentage ?? ''}\nhighest_profile=${report.readiness.highest_profile ?? 'none'}\ntarget_passed=${String(report.readiness.target_passed)}\nreport_path=${reportPath ?? ''}\n`,
          'utf8',
        );
      }

      if (options.enforce && !report.readiness.target_passed) process.exitCode = 2;
    },
  );

await program.parseAsync();
