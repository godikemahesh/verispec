/**
 * VeriSpec Regression Command
 * 
 * Generates and optionally executes a targeted regression test suite
 * based on Git change impact analysis, reducing test execution time
 * while maintaining safety.
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { spawn } from 'child_process';
import {
  requireInit,
  readConfig,
  readTestRegistry,
  readProjectTemplate,
  renderTemplate,
  REGRESSION_DIR,
  STATE_DIR,
  getRunId,
  LATEST_REPORT_DIR,
} from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import { impactCommand } from './impact.js';

export async function regressionCommand(options) {
  const cwd = process.cwd();
  requireInit(cwd);
  logger.banner('VeriSpec Targeted Regression Selector');

  const spinner = ora('Evaluating change impact and selecting regression test suite...').start();

  try {
    const registry = await readTestRegistry(cwd);
    const registeredTests = registry.tests || [];
    const totalSuiteSize = registeredTests.length;

    // 1. Read or trigger impact analysis
    const stateDir = path.resolve(cwd, STATE_DIR);
    const impactStateFile = path.join(stateDir, 'latest-impact.json');

    let impactData = null;
    if (fs.existsSync(impactStateFile)) {
      impactData = await fs.readJSON(impactStateFile);
    } else {
      spinner.text = 'No recent impact analysis found. Running impact analysis first...';
      await impactCommand({});
      if (fs.existsSync(impactStateFile)) {
        impactData = await fs.readJSON(impactStateFile);
      }
    }

    const affectedTcIds = new Set(
      (impactData?.affectedTests || []).map(t => t.tc_id)
    );

    // 2. Select regression tests
    const safetyFactor = parseFloat(options.safety || '1.0');
    const selectedTests = [];
    const selectedIds = new Set();

    // Priority A: Direct impact tests
    for (const t of registeredTests) {
      if (affectedTcIds.has(t.id)) {
        selectedTests.push({ ...t, reason: 'Direct Change Impact' });
        selectedIds.add(t.id);
      }
    }

    // Priority B: P0 Invariant Safety tests (always run critical tests)
    for (const t of registeredTests) {
      if (t.priority === 'P0' && !selectedIds.has(t.id)) {
        selectedTests.push({ ...t, reason: 'P0 Critical Safety Invariant' });
        selectedIds.add(t.id);
      }
    }

    // Priority C: If high risk or safetyFactor > 1.0, include P1 tests
    if (safetyFactor > 1.0 || impactData?.overallRisk === 'HIGH') {
      for (const t of registeredTests) {
        if (t.priority === 'P1' && !selectedIds.has(t.id)) {
          selectedTests.push({ ...t, reason: 'High-Risk Safety Buffer (P1)' });
          selectedIds.add(t.id);
        }
      }
    }

    // If still empty (e.g. no tests matched), select at least the first available tests
    if (selectedTests.length === 0 && registeredTests.length > 0) {
      selectedTests.push({ ...registeredTests[0], reason: 'Smoke baseline' });
      selectedIds.add(registeredTests[0].id);
    }

    const selectedCount = selectedTests.length;
    const excludedCount = totalSuiteSize - selectedCount;
    const reductionPct = totalSuiteSize > 0
      ? (((totalSuiteSize - selectedCount) / totalSuiteSize) * 100).toFixed(1)
      : '0.0';

    // Group selected tests by tier
    const testsByTier = {};
    for (const t of selectedTests) {
      const tier = (t.tier || 'api').toUpperCase();
      if (!testsByTier[tier]) testsByTier[tier] = [];
      testsByTier[tier].push(t);
    }

    const tierSections = Object.entries(testsByTier).map(([tier, tests]) => ({
      tier,
      count: tests.length,
      tests: tests.map(t => ({
        tc_id: t.id,
        file: t.file || 'tests/',
        priority: t.priority || 'P1',
        reason: t.reason,
      })),
    }));

    const runId = getRunId();
    const regressionDir = path.resolve(cwd, REGRESSION_DIR);
    await fs.ensureDir(regressionDir);
    const planFileName = `plan-${runId}.md`;

    // Generate manual commands for selected tests
    const filesToRun = [...new Set(selectedTests.map(t => t.file).filter(Boolean))];
    const manualCommands = filesToRun.map(f => ({ command: `pytest ${f} -v` }));

    // 3. Render regression plan markdown
    const template = readProjectTemplate('regression.template.md', cwd);
    const context = {
      run_id: runId,
      timestamp: new Date().toISOString(),
      impact_file: impactData?.impactFileName || 'latest-impact.json',
      total_suite_size: totalSuiteSize,
      selected_count: selectedCount,
      reduction_percentage: reductionPct,
      estimated_duration: `${Math.max(1, Math.round(selectedCount * 0.5))}s (approx)`,
      safety_factor: safetyFactor.toFixed(1),
      selection_categories: [
        { name: 'Direct Impact', count: affectedTcIds.size, criteria: 'Tests covering modified source files & requirements' },
        { name: 'Critical Invariants', count: selectedTests.filter(t => t.priority === 'P0').length, criteria: 'P0 core functionality preserved across all changes' },
      ],
      selected_tests: tierSections,
      excluded_count: excludedCount,
      manual_commands: manualCommands,
      version: '0.1.0',
    };

    const rendered = renderTemplate(template, context);
    await fs.writeFile(path.join(regressionDir, planFileName), rendered, 'utf-8');

    spinner.succeed(`Targeted regression plan generated: ${selectedCount} of ${totalSuiteSize} tests selected (${reductionPct}% reduction)`);

    // Output plan to terminal
    console.log('');
    console.log(chalk.bold('Targeted Regression Selection:'));
    console.log(`  Full Suite Size:       ${chalk.bold(totalSuiteSize)} tests`);
    console.log(`  Selected Regression:   ${chalk.green.bold(selectedCount)} tests`);
    console.log(`  Excluded (Safe):       ${chalk.dim(excludedCount)} tests`);
    console.log(`  Execution Reduction:   ${chalk.bold.green(`${reductionPct}% saved`)}`);
    console.log(`  Plan Artifact:         ${chalk.cyan(`.verispec/regression/${planFileName}`)}`);
    console.log('');

    // If --plan flag was passed, stop here
    if (options.plan) {
      console.log(chalk.bold('Execution Plan (--plan mode active, tests not executed):'));
      manualCommands.forEach(c => {
        console.log(`  ${chalk.dim('$')} ${chalk.cyan(c.command)}`);
      });
      console.log('');
      logger.info('To execute these tests, re-run without --plan: ' + chalk.cyan('verispec regression'));
      return;
    }

    // 4. Execute Selected Regression Tests
    console.log(chalk.bold.cyan('▶ Executing Targeted Regression Suite...'));
    console.log('');

    let anyFailed = false;
    for (const cmdObj of manualCommands) {
      console.log(`${chalk.dim('$')} ${chalk.white(cmdObj.command)}`);
      const code = await executeCommand(cmdObj.command, cwd);
      if (code !== 0) anyFailed = true;
    }

    console.log('');
    if (anyFailed) {
      console.log(chalk.red('✗ Regression test suite completed with failures.'));
      console.log(chalk.yellow('Run: ') + chalk.cyan('verispec analyze'));
    } else {
      console.log(chalk.green.bold('✓ Targeted regression suite PASSED!'));
      console.log(chalk.dim('Results updated continuously in .verispec/reports/latest/report.html'));
    }
    console.log('');

  } catch (err) {
    spinner.fail(`Regression selection failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

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

    child.on('close', (code) => resolve(code || 0));
    child.on('error', (err) => {
      logger.error(`Execution error: ${err.message}`);
      resolve(1);
    });
  });
}
