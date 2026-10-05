/**
 * VeriSpec CLI — Command Registration
 * 
 * Registers all VeriSpec commands with Commander.js.
 * Each command maps to a dedicated handler module.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { rulebookCommand } from './commands/rulebook.js';
import { strategyCommand } from './commands/strategy.js';
import { casesCommand } from './commands/cases.js';
import { implementCommand } from './commands/implement.js';
import { runCommand } from './commands/run.js';
import { analyzeCommand } from './commands/analyze.js';
import { traceCommand } from './commands/trace.js';
import { impactCommand } from './commands/impact.js';
import { regressionCommand } from './commands/regression.js';
import { agentCommand } from './commands/agent.js';

const BANNER = `
${chalk.bold.cyan('╔══════════════════════════════════════════════════════════╗')}
${chalk.bold.cyan('║')}  ${chalk.bold.white('VeriSpec')} ${chalk.dim('— Spec-Driven Quality Engineering')}           ${chalk.bold.cyan('║')}
${chalk.bold.cyan('║')}  ${chalk.dim('Turn specs into traceable, executable test evidence.')}   ${chalk.bold.cyan('║')}
${chalk.bold.cyan('╚══════════════════════════════════════════════════════════╝')}
`;

export function createCli() {
  const program = new Command();

  program
    .name('verispec')
    .description('VeriSpec — Spec-Driven Quality Engineering Framework')
    .version('0.1.0')
    .addHelpText('before', BANNER);

  // ─────────────────────────────────────────────
  // Core Workflow Commands
  // ─────────────────────────────────────────────

  program
    .command('init')
    .description('Initialize VeriSpec in the current project. Scaffolds .verispec/ directory, templates, reporters, and agent bindings.')
    .option('--agent <agent>', 'Primary coding agent: claude | copilot | cursor | antigravity | windsurf | all')
    .option('--force', 'Overwrite existing .verispec/ directory', false)
    .action(initCommand);

  program
    .command('agent [name]')
    .description('Install or reconfigure bindings for a specific AI coding agent (claude | copilot | cursor | antigravity | windsurf | all)')
    .action(agentCommand);

  program
    .command('rulebook')
    .description('Create or update the project testing rulebook (.verispec/rulebook.md)')
    .option('--edit', 'Open rulebook for editing after creation', false)
    .action(rulebookCommand);

  program
    .command('strategy')
    .description('Generate test strategy from spec.md or existing codebase analysis')
    .option('--spec <path>', 'Path to specification file', 'spec.md')
    .option('--brownfield', 'Analyze existing codebase instead of spec', false)
    .action(strategyCommand);

  program
    .command('cases')
    .description('Generate structured test cases with stable IDs from the approved strategy')
    .option('--feature <name>', 'Generate cases for a specific feature only')
    .option('--categories <types>', 'Comma-separated: functional,negative,boundary,security', 'functional,negative,boundary,security')
    .action(casesCommand);

  program
    .command('implement')
    .description('Generate native test code (pytest/playwright/k6) from approved test cases with continuous reporters injected')
    .option('--tier <tier>', 'Generate for specific tier: unit,api,integration,e2e,security,performance')
    .option('--dry-run', 'Preview what would be generated without writing files', false)
    .action(implementCommand);

  program
    .command('run')
    .description('Execute tests according to strategy with continuous reporting')
    .option('--tier <tier>', 'Run specific tier: unit,api,integration,e2e,security,performance')
    .option('--case <id>', 'Run a specific test case by ID (e.g., TC-JC-005)')
    .option('--req <id>', 'Run all tests for a specific requirement (e.g., REQ-JC-001)')
    .option('--parallel', 'Run test tiers in parallel', false)
    .action(runCommand);

  // ─────────────────────────────────────────────
  // Intelligence & Analysis Commands
  // ─────────────────────────────────────────────

  program
    .command('analyze')
    .description('AI-powered failure analysis: diagnose failures, classify defects, suggest root causes')
    .option('--run <id>', 'Analyze a specific run by ID')
    .option('--case <id>', 'Analyze a specific failed test case')
    .action(analyzeCommand);

  program
    .command('trace')
    .description('Generate bidirectional traceability matrix: REQ → TC → Test → Run → Defect')
    .option('--format <format>', 'Output format: md,html,json', 'md,html')
    .action(traceCommand);

  program
    .command('impact')
    .description('Analyze code changes to determine affected requirements and tests')
    .option('--base <ref>', 'Git base reference', 'main')
    .option('--head <ref>', 'Git head reference', 'HEAD')
    .action(impactCommand);

  program
    .command('regression')
    .description('Generate and optionally execute targeted regression suite from impact analysis')
    .option('--plan', 'Only generate regression plan without executing', false)
    .option('--safety <factor>', 'Safety factor multiplier for test selection (0.5-2.0)', '1.0')
    .action(regressionCommand);

  return program;
}
