/**
 * VeriSpec Rulebook Command
 * 
 * Creates, updates, or displays the project's permanent testing policy
 * and quality gate criteria (.verispec/rulebook.md).
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { requireInit, VERISPEC_DIR, readBundledTemplate, renderTemplate } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';

export async function rulebookCommand(options) {
  const cwd = process.cwd();
  requireInit(cwd);

  const rulebookPath = path.resolve(cwd, VERISPEC_DIR, 'rulebook.md');
  logger.banner('VeriSpec Rulebook');

  if (!fs.existsSync(rulebookPath)) {
    // Generate fresh rulebook from template
    const template = readBundledTemplate('rulebook.template.md');
    const content = renderTemplate(template, {
      project_name: path.basename(cwd),
      date: new Date().toISOString().slice(0, 10),
    });
    await fs.writeFile(rulebookPath, content, 'utf-8');
    logger.success(`Created: .verispec/rulebook.md`);
  }

  const content = await fs.readFile(rulebookPath, 'utf-8');
  
  // Extract and display key sections
  console.log(chalk.bold.white('Active Quality Gates & Testing Standards:'));
  console.log('');

  // Parse Quality Gates section
  const lines = content.split('\n');
  let inGates = false;
  let inPrinciples = false;
  const gates = [];
  const principles = [];

  for (const line of lines) {
    if (line.includes('## 1. Core Testing Principles')) {
      inPrinciples = true;
      inGates = false;
      continue;
    }
    if (line.includes('## 3. Quality Gate Thresholds') || line.includes('## Quality Gates')) {
      inGates = true;
      inPrinciples = false;
      continue;
    }
    if (line.startsWith('## ') && (inGates || inPrinciples)) {
      inGates = false;
      inPrinciples = false;
    }

    if (inPrinciples && /^\d+\.\s+\*\*(.+?)\*\*/.test(line)) {
      const match = line.match(/^\d+\.\s+\*\*(.+?)\*\*/);
      if (match) principles.push(match[1]);
    }

    if (inGates && line.startsWith('|') && !line.includes('---') && !line.includes('Gate')) {
      const parts = line.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        gates.push({ name: parts[0], threshold: parts[1], description: parts[2] || '' });
      }
    }
  }

  if (principles.length > 0) {
    console.log(chalk.bold.cyan('Core Principles:'));
    principles.forEach((p, i) => {
      console.log(`  ${chalk.dim(`${i + 1}.`)} ${chalk.white(p)}`);
    });
    console.log('');
  }

  if (gates.length > 0) {
    console.log(chalk.bold.cyan('Quality Gates:'));
    logger.table(
      ['Quality Gate', 'Threshold', 'Scope'],
      gates.map(g => [g.name, g.threshold, g.description])
    );
  }

  console.log('');
  logger.info(`Rulebook location: ${chalk.cyan('.verispec/rulebook.md')}`);
  logger.info(`To customize quality gates or principles, edit ${chalk.cyan('.verispec/rulebook.md')} directly.`);
}
