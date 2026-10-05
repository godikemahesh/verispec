/**
 * VeriSpec Run Command
 * 
 * Orchestrates test execution according to strategy across tiers,
 * with support for filtering by tier, requirement ID, or test case ID.
 * Test results are continuously streamed by reporters into .verispec/reports/latest/.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import {
  requireInit,
  readConfig,
  readTestRegistry,
  LATEST_REPORT_DIR,
} from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';

export async function runCommand(options) {
  const cwd = process.cwd();
  requireInit(cwd);
  logger.banner('VeriSpec Test Execution Orchestrator');

  const config = await readConfig(cwd);
  const registry = await readTestRegistry(cwd);

  // 1. Determine execution targets
  let targets = [];

  if (options.case) {
    const matched = registry.tests.find(t => t.id.toLowerCase() === options.case.toLowerCase());
    if (!matched) {
      logger.error(`Test case not found in registry: ${options.case}`);
      return;
    }
    targets.push({
      label: `Single Test: ${matched.id} (${matched.title})`,
      command: matched.command || `pytest ${matched.file} -k ${matched.function} -v`,
      tier: matched.tier,
    });
  } else if (options.req) {
    const matchedTests = registry.tests.filter(t => t.req_id.toLowerCase() === options.req.toLowerCase());
    if (matchedTests.length === 0) {
      logger.error(`No tests registered for requirement: ${options.req}`);
      return;
    }
    const files = [...new Set(matchedTests.map(t => t.file))];
    targets.push({
      label: `Requirement ${options.req} (${matchedTests.length} tests)`,
      command: `pytest ${files.join(' ')} -v`,
      tier: 'mixed',
    });
  } else if (options.tier) {
    const tierName = options.tier.toLowerCase();
    const runner = config.runners?.[tierName];
    if (!runner || !runner.enabled) {
      // Check if tests exist in tests/<tier>
      const tierDir = path.resolve(cwd, 'tests', tierName);
      if (fs.existsSync(tierDir)) {
        targets.push({
          label: `${tierName.toUpperCase()} Tests`,
          command: `pytest tests/${tierName} -v`,
          tier: tierName,
        });
      } else {
        logger.error(`Tier '${tierName}' is not enabled or tests/${tierName} directory does not exist.`);
        return;
      }
    } else {
      targets.push({
        label: `${tierName.toUpperCase()} Tests`,
        command: runner.command,
        tier: tierName,
      });
    }
  } else {
    // Full Strategy Execution: Run all enabled tiers in sequence
    const tierOrder = ['unit', 'api', 'integration', 'e2e', 'security', 'performance'];
    for (const tier of tierOrder) {
      const runner = config.runners?.[tier];
      const tierDir = path.resolve(cwd, 'tests', tier);

      if (runner?.enabled && runner.command) {
        targets.push({
          label: `${tier.toUpperCase()} Tests`,
          command: runner.command,
          tier,
        });
      } else if (fs.existsSync(tierDir)) {
        // Auto-run if folder exists
        targets.push({
          label: `${tier.toUpperCase()} Tests`,
          command: `pytest tests/${tier} -v`,
          tier,
        });
      }
    }
  }

  if (targets.length === 0) {
    // Default fallback: run pytest tests/
    targets.push({
      label: 'All Tests',
      command: 'pytest tests/ -v',
      tier: 'all',
    });
  }

  console.log(chalk.bold('Execution Plan:'));
  targets.forEach((t, i) => {
    console.log(`  ${chalk.cyan(`[${i + 1}/${targets.length}]`)} ${chalk.white(t.label)}: ${chalk.dim(t.command)}`);
  });
  console.log('');

  // 2. Execute targets
  let anyFailed = false;

  for (const target of targets) {
    logger.divider();
    console.log(`${chalk.bold.cyan('▶ Running:')} ${chalk.bold.white(target.label)}`);
    console.log(`${chalk.dim('$')} ${chalk.dim(target.command)}`);
    console.log('');

    const exitCode = await executeCommand(target.command, cwd);
    if (exitCode !== 0) {
      anyFailed = true;
      console.log(chalk.red(`\n✗ ${target.label} exited with code ${exitCode}`));
    } else {
      console.log(chalk.green(`\n✓ ${target.label} completed successfully`));
    }
  }

  // 3. Read live-updated continuous report from .verispec/reports/latest/results.json
  const resultsPath = path.resolve(cwd, LATEST_REPORT_DIR, 'results.json');
  if (fs.existsSync(resultsPath)) {
    try {
      const results = await fs.readJSON(resultsPath);
      printExecutionSummary(results);
    } catch {
      // Continue if report parsing had an issue
    }
  }

  console.log('');
  console.log(chalk.bold('Continuous Reports:'));
  console.log(`  ${chalk.cyan('Dashboard:')} file://${path.resolve(cwd, LATEST_REPORT_DIR, 'report.html').replace(/\\/g, '/')}`);
  console.log(`  ${chalk.cyan('Markdown:')}  .verispec/reports/latest/report.md`);
  console.log('');

  if (anyFailed) {
    console.log(chalk.yellow('💡 Failures detected. Run ') + chalk.bold.cyan('verispec analyze') + chalk.yellow(' for AI-powered root-cause diagnosis.'));
  }
}

/**
 * Execute a shell command and stream output
 */
function executeCommand(commandStr, cwd) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const flag = isWindows ? '/c' : '-c';

    const child = spawn(shell, [flag, commandStr], {
      cwd,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      resolve(code || 0);
    });

    child.on('error', (err) => {
      logger.error(`Execution error: ${err.message}`);
      resolve(1);
    });
  });
}

/**
 * Format and print summary results
 */
function printExecutionSummary(results) {
  logger.divider();
  console.log('');
  console.log(chalk.bold('Execution Summary (Continuous Reporter):'));

  const s = results.summary || {};
  const total = s.total || 0;
  const passed = s.passed || 0;
  const failed = s.failed || 0;
  const skipped = s.skipped || 0;
  const rate = s.pass_rate || (total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0');

  console.log(`  Total:     ${chalk.bold(total)}`);
  console.log(`  Passed:    ${chalk.green.bold(passed)}`);
  console.log(`  Failed:    ${failed > 0 ? chalk.red.bold(failed) : chalk.dim(0)}`);
  console.log(`  Skipped:   ${chalk.yellow(skipped)}`);
  console.log(`  Pass Rate: ${Number(rate) >= 95 ? chalk.green.bold(rate + '%') : chalk.red.bold(rate + '%')}`);

  // Requirements breakdown
  if (results.requirements && Object.keys(results.requirements).length > 0) {
    console.log('');
    console.log(chalk.bold('Requirement Verification Status:'));
    const rows = Object.values(results.requirements).map(r => {
      const statusIcon = r.status === 'verified' ? chalk.green('✓ VERIFIED') :
                         r.status === 'unverified' ? chalk.red('✗ FAILED') : chalk.yellow('░ PARTIAL');
      return [r.req_id, String(r.total_tests || 0), String(r.passed || 0), String(r.failed || 0), statusIcon];
    });
    logger.table(['Requirement', 'Total', 'Pass', 'Fail', 'Status'], rows);
  }

  // Quality Gates
  if (results.quality_gates && results.quality_gates.length > 0) {
    console.log('');
    console.log(chalk.bold('Quality Gate Evaluation:'));
    const gateRows = results.quality_gates.map(g => [
      g.name,
      g.threshold,
      g.actual,
      g.passed ? chalk.green('✓ PASS') : chalk.red('✗ FAIL'),
    ]);
    logger.table(['Quality Gate', 'Threshold', 'Actual', 'Status'], gateRows);
  }
}
