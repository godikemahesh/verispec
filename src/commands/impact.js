/**
 * VeriSpec Impact Command
 * 
 * Analyzes Git diffs (base...head) against requirements and the test registry
 * to determine affected requirements, affected tests, and overall change risk.
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import {
  requireInit,
  readConfig,
  readRequirementMap,
  readTestRegistry,
  readProjectTemplate,
  renderTemplate,
  IMPACT_DIR,
  STATE_DIR,
  getTimestamp,
} from '../utils/file-utils.js';
import {
  isGitRepo,
  getDiffSummary,
  getChangedFiles,
  getCurrentBranch,
  getLatestCommit,
} from '../utils/git-utils.js';
import { logger } from '../utils/logger.js';

export async function impactCommand(options) {
  const cwd = process.cwd();
  requireInit(cwd);
  logger.banner('VeriSpec Change Impact Analysis');

  const baseRef = options.base || 'main';
  const headRef = options.head || 'HEAD';

  const spinner = ora(`Analyzing git changes between ${baseRef} and ${headRef}...`).start();

  try {
    const gitRepo = await isGitRepo(cwd);
    let changedFiles = [];
    let diffSummary = { files: [], filesChanged: 0, insertions: 0, deletions: 0 };
    let branch = 'unknown';
    let commit = 'unknown';

    if (gitRepo) {
      diffSummary = await getDiffSummary(baseRef, headRef, cwd);
      changedFiles = await getChangedFiles(baseRef, headRef, cwd);
      branch = await getCurrentBranch(cwd);
      commit = await getLatestCommit(cwd);
    } else {
      // Mock / fallback if not a git repository
      changedFiles = ['src/', 'app/'];
    }

    spinner.succeed(`Identified ${changedFiles.length} modified file(s)`);

    const reqMap = await readRequirementMap(cwd);
    const registry = await readTestRegistry(cwd);
    const requirements = Object.values(reqMap.requirements || {});
    const registeredTests = registry.tests || [];

    // 2. Map modified files to affected requirements and tests
    const impactedReqs = [];
    const affectedTests = [];
    let coreLogicModified = false;
    let schemaChanged = false;
    let authChanged = false;

    for (const file of changedFiles) {
      const lower = file.toLowerCase();
      if (/auth|login|token|permission|security/i.test(lower)) authChanged = true;
      if (/model|schema|migration|db|database/i.test(lower)) schemaChanged = true;
      if (/service|controller|route|api|logic/i.test(lower)) coreLogicModified = true;

      // Find matching tests in registry
      for (const t of registeredTests) {
        const testFileMatch = t.file && t.file.toLowerCase().includes(path.basename(file, path.extname(file)).toLowerCase());
        if (testFileMatch && !affectedTests.some(at => at.tc_id === t.id)) {
          affectedTests.push({
            tc_id: t.id,
            test_file: t.file,
            tier: t.tier,
            reason: `Direct source match with modified file: ${file}`,
          });
        }
      }
    }

    // Correlate with requirements
    for (const req of requirements) {
      const isAuthReq = /auth|security/i.test(req.title + ' ' + req.description);
      const isCriticalReq = req.risk_level === 'Critical';

      let impacted = false;
      let reason = '';

      if (authChanged && isAuthReq) {
        impacted = true;
        reason = 'Authentication / security-related files modified in diff';
      } else if (coreLogicModified && isCriticalReq) {
        impacted = true;
        reason = 'Core business logic modified; critical flow requires verification';
      } else if (affectedTests.some(at => {
        const matchingTest = registeredTests.find(t => t.id === at.tc_id);
        return matchingTest?.req_id === req.id;
      })) {
        impacted = true;
        reason = 'Direct test case mapping to modified file';
      }

      if (impacted && !impactedReqs.some(r => r.id === req.id)) {
        impactedReqs.push({
          id: req.id,
          title: req.title,
          impact_type: isCriticalReq ? 'Direct Critical Impact' : 'Secondary Impact',
          reason,
          risk: req.risk_level || 'High',
        });

        // Add tests for this requirement to affectedTests if not already added
        const testsForReq = registeredTests.filter(t => t.req_id === req.id);
        for (const t of testsForReq) {
          if (!affectedTests.some(at => at.tc_id === t.id)) {
            affectedTests.push({
              tc_id: t.id,
              test_file: t.file,
              tier: t.tier,
              reason: `Requirement ${req.id} affected by code change`,
            });
          }
        }
      }
    }

    // If no specific matches found, select P0 tests as baseline
    if (affectedTests.length === 0 && registeredTests.length > 0) {
      const p0Tests = registeredTests.filter(t => t.priority === 'P0');
      for (const t of p0Tests) {
        affectedTests.push({
          tc_id: t.id,
          test_file: t.file,
          tier: t.tier,
          reason: 'Baseline P0 safety regression',
        });
      }
    }

    // Determine overall risk
    const overallRisk = authChanged || schemaChanged ? 'HIGH' :
                        coreLogicModified ? 'MEDIUM' : 'LOW';

    // 3. Render and save impact artifact
    const impactDir = path.resolve(cwd, IMPACT_DIR);
    await fs.ensureDir(impactDir);
    const timestampStr = getTimestamp();
    const impactFileName = `impact-${timestampStr}.md`;

    const template = readProjectTemplate('impact.template.md', cwd);
    const context = {
      git_ref: `${baseRef}...${headRef}`,
      timestamp: new Date().toISOString(),
      base_ref: baseRef,
      head_ref: headRef,
      branch: branch || 'HEAD',
      changed_files: diffSummary.files.map(f => ({
        file: f.file,
        change_type: f.insertions > 0 && f.deletions === 0 ? 'Added' : 'Modified',
        insertions: f.insertions,
        deletions: f.deletions,
        symbols: '—',
      })),
      total_files_changed: changedFiles.length,
      total_insertions: diffSummary.insertions,
      total_deletions: diffSummary.deletions,
      impacted_requirements: impactedReqs,
      affected_tests: affectedTests,
      total_affected_tests: affectedTests.length,
      overall_risk: overallRisk,
      core_logic_modified: coreLogicModified ? 'Yes' : 'No',
      schema_changed: schemaChanged ? 'Yes' : 'No',
      auth_changed: authChanged ? 'Yes' : 'No',
      recommendation: overallRisk === 'HIGH'
        ? 'High-risk change detected. Execute full regression suite for affected components before merge.'
        : 'Targeted regression recommended for identified test set.',
      version: '0.1.0',
    };

    const rendered = renderTemplate(template, context);
    await fs.writeFile(path.join(impactDir, impactFileName), rendered, 'utf-8');

    // Save latest impact state
    const stateDir = path.resolve(cwd, STATE_DIR);
    await fs.writeJSON(path.join(stateDir, 'latest-impact.json'), {
      timestamp: new Date().toISOString(),
      impactFileName,
      overallRisk,
      impactedRequirements: impactedReqs,
      affectedTests,
    }, { spaces: 2 });

    // 4. Output Summary
    console.log('');
    console.log(chalk.bold('Impact Assessment:'));
    console.log(`  Modified Files:        ${chalk.bold(changedFiles.length)}`);
    console.log(`  Affected Requirements: ${chalk.bold(impactedReqs.length)}`);
    console.log(`  Affected Tests:        ${chalk.bold(affectedTests.length)} / ${registeredTests.length}`);
    console.log(`  Overall Risk Score:    ${overallRisk === 'HIGH' ? chalk.red.bold('HIGH') : overallRisk === 'MEDIUM' ? chalk.yellow.bold('MEDIUM') : chalk.green.bold('LOW')}`);
    console.log(`  Artifact:              ${chalk.cyan(`.verispec/impact/${impactFileName}`)}`);
    console.log('');

    if (affectedTests.length > 0) {
      console.log(chalk.bold('Selected Affected Tests:'));
      logger.table(
        ['Test Case', 'Test File', 'Tier', 'Reason'],
        affectedTests.slice(0, 10).map(t => [t.tc_id, t.test_file || '—', t.tier || '—', t.reason])
      );
      if (affectedTests.length > 10) {
        console.log(chalk.dim(`  ... and ${affectedTests.length - 10} more tests`));
      }
    }

    console.log('');
    logger.info(`Next step: Run ${chalk.cyan('verispec regression')} to run the targeted regression suite.`);
    console.log('');

  } catch (err) {
    spinner.fail(`Impact analysis failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}
