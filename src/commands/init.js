/**
 * VeriSpec Init Command
 * 
 * Scaffolds .verispec/ directory, detects project stack,
 * bootstraps continuous reporting files (results.json, report.html, report.md),
 * installs test reporters, and configures AI coding agents.
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import ora from 'ora';
import chalk from 'chalk';
import { detectStack, stackToRunnerConfig } from '../utils/detector.js';
import {
  VERISPEC_DIR,
  TEMPLATES_DIR,
  REPORTS_DIR,
  LATEST_REPORT_DIR,
  DEFECTS_DIR,
  CASES_DIR,
  IMPACT_DIR,
  REGRESSION_DIR,
  STATE_DIR,
  REPORTERS_DIR,
  RULES_DIR,
  isInitialized,
  renderTemplate,
  writeFile,
} from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import { installAgentBindings } from '../agents/agent-installer.js';
import { playInitAnimation, renderSuccessHero } from '../utils/animation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

export async function initCommand(options) {
  const cwd = process.cwd();
  await playInitAnimation({ version: '0.1.6' });

  if (isInitialized(cwd) && !options.force) {
    logger.warn('VeriSpec is already initialized in this project.');
    logger.info('Use --force to overwrite configuration.');
    return;
  }

  // Determine target coding agent (interactive prompt if in TTY)
  let selectedAgent = options.agent;
  if (!selectedAgent) {
    if (process.stdin.isTTY && !process.env.CI) {
      const inquirer = (await import('inquirer')).default;
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'agent',
          message: 'Select your AI coding assistant:',
          choices: [
            { name: 'Claude Code (.claude/ slash commands & CLAUDE.md)', value: 'claude' },
            { name: 'GitHub Copilot (.github/copilot-instructions.md & prompts)', value: 'copilot' },
            { name: 'Cursor (.cursor/rules/verispec.mdc)', value: 'cursor' },
            { name: 'Google Antigravity (.agents/rules & skills)', value: 'antigravity' },
            { name: 'Windsurf (.windsurfrules)', value: 'windsurf' },
            { name: 'All Agents (Universal setup)', value: 'all' },
          ],
          default: 'claude',
        },
      ]);
      selectedAgent = answer.agent;
    } else {
      selectedAgent = 'all';
    }
  }

  const spinner = ora('Detecting project stack and environment...').start();

  try {
    // 1. Detect project stack
    const stack = await detectStack(cwd);
    spinner.succeed(`Stack detected: ${chalk.bold(stack.language || 'generic')} (${stack.frameworks.join(', ') || 'vanilla'})`);

    // 2. Scaffold directory structure
    const scaffoldSpinner = ora('Creating VeriSpec directory structure...').start();
    const dirs = [
      VERISPEC_DIR,
      TEMPLATES_DIR,
      RULES_DIR,
      CASES_DIR,
      DEFECTS_DIR,
      IMPACT_DIR,
      REGRESSION_DIR,
      LATEST_REPORT_DIR,
      STATE_DIR,
      REPORTERS_DIR,
    ];

    for (const d of dirs) {
      await fs.ensureDir(path.resolve(cwd, d));
    }
    scaffoldSpinner.succeed('Created .verispec/ workspace directories');

    // 3. Copy bundled templates to .verispec/templates/
    const bundledTemplatesDir = path.resolve(PACKAGE_ROOT, 'src', 'templates');
    if (fs.existsSync(bundledTemplatesDir)) {
      await fs.copy(bundledTemplatesDir, path.resolve(cwd, TEMPLATES_DIR));
      logger.success('Copied workflow templates to .verispec/templates/');
    }

    // 4. Generate .verispec/config.yaml
    const runners = stackToRunnerConfig(stack);
    const configTemplate = await fs.readFile(
      path.resolve(bundledTemplatesDir, 'config.template.yaml'),
      'utf-8'
    );

    const configData = {
      project_name: path.basename(cwd),
      spec_path: stack.specFile || 'spec.md',
      language: stack.language || 'python',
      frameworks: stack.frameworks,
      unit_command: runners.unit?.command || 'pytest tests/unit -v',
      unit_framework: runners.unit?.framework || 'pytest',
      unit_enabled: runners.unit?.enabled ?? true,
      api_command: runners.api?.command || 'pytest tests/api -v',
      api_framework: runners.api?.framework || 'pytest',
      api_enabled: runners.api?.enabled ?? true,
      integration_command: runners.integration?.command || 'pytest tests/integration -v',
      integration_framework: runners.integration?.framework || 'pytest',
      integration_enabled: runners.integration?.enabled ?? true,
      e2e_command: runners.e2e?.command || 'npx playwright test',
      e2e_framework: runners.e2e?.framework || 'playwright',
      e2e_enabled: runners.e2e?.enabled ?? false,
      security_command: runners.security?.command || 'pytest tests/security -v',
      security_framework: runners.security?.framework || 'pytest',
      security_enabled: runners.security?.enabled ?? false,
      performance_command: runners.performance?.command || 'k6 run',
      performance_framework: runners.performance?.framework || 'k6',
      performance_enabled: runners.performance?.enabled ?? false,
      agent: selectedAgent,
    };

    const renderedConfig = renderTemplate(configTemplate, configData);
    await writeFile(path.join(VERISPEC_DIR, 'config.yaml'), renderedConfig, cwd);

    // 5. Bootstrap Rulebook (.verispec/rulebook.md)
    const rulebookTemplate = await fs.readFile(
      path.resolve(bundledTemplatesDir, 'rulebook.template.md'),
      'utf-8'
    );
    const initialRulebook = renderTemplate(rulebookTemplate, {
      project_name: path.basename(cwd),
      date: new Date().toISOString().slice(0, 10),
    });
    await writeFile(path.join(VERISPEC_DIR, 'rulebook.md'), initialRulebook, cwd);

    // 6. Bootstrap Continuous Reporting (.verispec/reports/latest/)
    // This satisfies the critical continuous reporting requirement:
    // results.json, report.html, and report.md are available immediately.
    const reportingSpinner = ora('Bootstrapping continuous reporting system...').start();
    
    // 6a. results.json initial state
    const initialResults = {
      verispec_version: '0.1.0',
      run_id: 'RUN-INITIAL',
      timestamp_start: new Date().toISOString(),
      timestamp_end: null,
      status: 'idle',
      execution_mode: 'continuous',
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        errors: 0,
        pass_rate: 0.0,
        duration_ms: 0,
      },
      tiers: {},
      requirements: {},
      tests: [],
      quality_gates: [
        { name: 'Overall Pass Rate', threshold: '≥ 95%', actual: '0.0%', passed: false },
        { name: 'Zero Critical Failures', threshold: '0 failures', actual: '0 failures', passed: true },
        { name: 'Requirement Coverage', threshold: '100%', actual: '0%', passed: false },
        { name: 'Requirements Verified', threshold: '100%', actual: '0%', passed: false },
      ],
      defects: [],
    };
    await fs.writeJSON(
      path.resolve(cwd, LATEST_REPORT_DIR, 'results.json'),
      initialResults,
      { spaces: 2 }
    );

    // 6b. Copy interactive report.html with initialResults embedded
    const reportTemplateHtmlPath = path.resolve(bundledTemplatesDir, 'report.template.html');
    if (fs.existsSync(reportTemplateHtmlPath)) {
      let htmlContent = await fs.readFile(reportTemplateHtmlPath, 'utf-8');
      const dataScript = `<script id="verispec-data">window.__VERISPEC_DATA__ = ${JSON.stringify(initialResults, null, 2)};</script>`;
      if (htmlContent.includes('<script id="verispec-data">')) {
        htmlContent = htmlContent.replace(/<script id="verispec-data">[\s\S]*?<\/script>/, dataScript);
      } else if (htmlContent.includes('</head>')) {
        htmlContent = htmlContent.replace('</head>', `  ${dataScript}\n</head>`);
      } else {
        htmlContent = dataScript + '\n' + htmlContent;
      }
      await fs.writeFile(
        path.resolve(cwd, LATEST_REPORT_DIR, 'report.html'),
        htmlContent,
        'utf-8'
      );
    }

    // 6c. Render initial report.md
    const reportTemplateMdPath = path.resolve(bundledTemplatesDir, 'report.template.md');
    if (fs.existsSync(reportTemplateMdPath)) {
      const reportMdTemplate = await fs.readFile(reportTemplateMdPath, 'utf-8');
      const initialReportMd = renderTemplate(reportMdTemplate, {
        run_id: 'RUN-INITIAL',
        timestamp: new Date().toLocaleString(),
        execution_mode: 'Continuous (Awaiting execution)',
        overall_status_icon: '⚪',
        overall_status: 'IDLE — Awaiting Test Execution',
        total_tests: 0,
        passed_tests: 0,
        failed_tests: 0,
        skipped_tests: 0,
        error_tests: 0,
        pass_rate: '0.0',
        total_duration: '0s',
        has_failures: false,
        version: '0.1.0',
      });
      await writeFile(path.join(LATEST_REPORT_DIR, 'report.md'), initialReportMd, cwd);
    }
    reportingSpinner.succeed('Continuous reports scaffolded in .verispec/reports/latest/');

    // 7. Install Reporters into Project
    const reporterSpinner = ora('Installing test reporter hooks...').start();
    const reportersSrc = path.resolve(PACKAGE_ROOT, 'src', 'reporters');
    
    // Copy reporters into .verispec/reporters/ for reference
    await fs.copy(reportersSrc, path.resolve(cwd, REPORTERS_DIR));

    // For Python: ensure tests/conftest.py has the VeriSpec reporter hook
    const testsDir = path.resolve(cwd, 'tests');
    await fs.ensureDir(testsDir);
    const conftestDest = path.resolve(testsDir, 'conftest.py');

    if (!fs.existsSync(conftestDest)) {
      await fs.copy(
        path.resolve(reportersSrc, 'conftest_verispec.py'),
        conftestDest
      );
      logger.success('Installed pytest continuous reporter: tests/conftest.py');
    } else {
      // Append if not present
      const existingConftest = await fs.readFile(conftestDest, 'utf-8');
      if (!existingConftest.includes('VeriSpec')) {
        const reporterCode = await fs.readFile(path.resolve(reportersSrc, 'conftest_verispec.py'), 'utf-8');
        await fs.writeFile(conftestDest, `${existingConftest}\n\n# ─── VeriSpec Hook ───\n${reporterCode}`, 'utf-8');
        logger.success('Appended VeriSpec continuous reporter to tests/conftest.py');
      }
    }
    reporterSpinner.succeed('Test execution reporters configured');

    // 8. Initialize State & Counters
    const stateSpinner = ora('Initializing test and requirement state registries...').start();
    const countersPath = path.resolve(cwd, STATE_DIR, 'id-counters.json');
    if (!fs.existsSync(countersPath)) {
      await fs.writeJSON(countersPath, {
        requirements: {},
        testCases: {},
        defects: {},
        runs: 0,
      }, { spaces: 2 });
    }

    const testRegistryPath = path.resolve(cwd, STATE_DIR, 'test-registry.json');
    if (!fs.existsSync(testRegistryPath)) {
      await fs.writeJSON(testRegistryPath, { tests: [], lastUpdated: new Date().toISOString() }, { spaces: 2 });
    }

    const reqMapPath = path.resolve(cwd, STATE_DIR, 'requirement-map.json');
    if (!fs.existsSync(reqMapPath)) {
      await fs.writeJSON(reqMapPath, { requirements: {}, lastUpdated: new Date().toISOString() }, { spaces: 2 });
    }
    stateSpinner.succeed('State registries initialized in .verispec/state/');

    // 9. Configure AI Coding Agents (Spec-Kit Multi-Agent Binding)
    const agentSpinner = ora(`Configuring AI agent bindings (${selectedAgent})...`).start();
    const installedAgents = await installAgentBindings(selectedAgent, cwd);
    agentSpinner.succeed(`Configured coding agents: ${installedAgents.join(', ')}`);

    // 10. Summary Banner & Futuristic Hero Card
    renderSuccessHero({
      version: '0.1.6',
      agents: installedAgents,
    });

  } catch (err) {
    spinner.fail(`Initialization failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}
