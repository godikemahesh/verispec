/**
 * VeriSpec Agent Command
 * 
 * Configures or switches AI coding agent bindings (Claude Code, GitHub Copilot,
 * Cursor, Google Antigravity, Windsurf, or All) in the project.
 * 
 * Usage:
 *   verispec agent claude
 *   verispec agent copilot
 *   verispec agent
 */

import chalk from 'chalk';
import ora from 'ora';
import { installAgentBindings, SUPPORTED_AGENTS } from '../agents/agent-installer.js';
import { readConfig, writeConfig, isInitialized } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';

export async function agentCommand(name) {
  const cwd = process.cwd();
  logger.banner('VeriSpec Agent Configuration');

  let selectedAgent = name;

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

  selectedAgent = selectedAgent.toLowerCase();
  if (!SUPPORTED_AGENTS.includes(selectedAgent)) {
    logger.error(`Unsupported agent: '${selectedAgent}'.`);
    logger.info(`Supported agents: ${SUPPORTED_AGENTS.join(', ')}`);
    return;
  }

  const spinner = ora(`Configuring bindings for ${chalk.bold(selectedAgent)}...`).start();

  try {
    const installed = await installAgentBindings(selectedAgent, cwd);

    // Update config.yaml if project is initialized
    if (isInitialized(cwd)) {
      try {
        const config = await readConfig(cwd);
        if (!config.agents) config.agents = {};
        config.agents.primary = selectedAgent;
        await writeConfig(config, cwd);
      } catch {
        // Continue even if config update fails
      }
    }

    spinner.succeed(`Successfully configured: ${chalk.bold.green(installed.join(', '))}`);

    console.log('');
    if (selectedAgent === 'claude' || selectedAgent === 'all') {
      console.log(chalk.bold('Claude Code Integration Ready:'));
      console.log(`  ${chalk.cyan('Instructions:')}   CLAUDE.md`);
      console.log(`  ${chalk.cyan('Slash Commands:')} .claude/commands/`);
      console.log(`  ${chalk.dim('You can now type in Claude Code:')}`);
      console.log(`    ${chalk.green('/strategy')} or ${chalk.green('/verispec.strategy')}`);
      console.log(`    ${chalk.green('/cases')}    or ${chalk.green('/verispec.cases')}`);
      console.log(`    ${chalk.green('/implement')} or ${chalk.green('/verispec.implement')}`);
      console.log(`    ${chalk.green('/run')}       or ${chalk.green('/verispec.run')}`);
      console.log(`    ${chalk.green('/analyze')}   or ${chalk.green('/verispec.analyze')}`);
      console.log(`    ${chalk.green('/trace')}     or ${chalk.green('/verispec.trace')}`);
      console.log(`    ${chalk.green('/impact')}    or ${chalk.green('/verispec.impact')}`);
      console.log(`    ${chalk.green('/regression')} or ${chalk.green('/verispec.regression')}`);
      console.log('');
    }

    if (selectedAgent === 'copilot' || selectedAgent === 'all') {
      console.log(chalk.bold('GitHub Copilot Integration Ready:'));
      console.log(`  ${chalk.cyan('Instructions:')}   .github/copilot-instructions.md`);
      console.log(`  ${chalk.cyan('Prompts:')}        .github/prompts/`);
      console.log('');
    }

    if (selectedAgent === 'cursor' || selectedAgent === 'all') {
      console.log(chalk.bold('Cursor Integration Ready:'));
      console.log(`  ${chalk.cyan('Rule file:')}      .cursor/rules/verispec.mdc`);
      console.log('');
    }

    if (selectedAgent === 'antigravity' || selectedAgent === 'all') {
      console.log(chalk.bold('Google Antigravity Integration Ready:'));
      console.log(`  ${chalk.cyan('Workspace Rule:')} .agents/rules/verispec.md`);
      console.log(`  ${chalk.cyan('Skill Guide:')}    .agents/skills/verispec/SKILL.md`);
      console.log('');
    }

    if (selectedAgent === 'windsurf' || selectedAgent === 'all') {
      console.log(chalk.bold('Windsurf Cascade Ready:'));
      console.log(`  ${chalk.cyan('Rule file:')}      .windsurfrules`);
      console.log('');
    }

  } catch (err) {
    spinner.fail(`Failed to configure agent bindings: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}
