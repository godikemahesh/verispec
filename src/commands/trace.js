/**
 * VeriSpec Trace Command
 * 
 * Generates bidirectional requirement-to-test-to-evidence traceability matrix
 * (.verispec/traceability.md and .verispec/traceability.html).
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
  LATEST_REPORT_DIR,
  VERISPEC_DIR,
} from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';

export async function traceCommand(options) {
  const cwd = process.cwd();
  requireInit(cwd);
  logger.banner('VeriSpec Bidirectional Traceability Matrix');

  const spinner = ora('Collating requirements, tests, execution evidence, and defects...').start();

  try {
    const config = await readConfig(cwd);
    const reqMap = await readRequirementMap(cwd);
    const registry = await readTestRegistry(cwd);

    // Read results.json if available
    const resultsPath = path.resolve(cwd, LATEST_REPORT_DIR, 'results.json');
    let results = { tests: [], defects: [], run_id: 'RUN-NONE' };
    if (fs.existsSync(resultsPath)) {
      results = await fs.readJSON(resultsPath);
    }

    const testExecutionMap = {};
    (results.tests || []).forEach(t => {
      const id = t.tc_id || t.id;
      if (id) testExecutionMap[id] = t;
    });

    const defectMap = {};
    (results.defects || []).forEach(d => {
      if (d.tc_id) defectMap[d.tc_id] = d.id;
    });

    const requirements = Object.values(reqMap.requirements || {});
    const registeredTests = registry.tests || [];

    // Calculate metrics
    let coveredReqsCount = 0;
    let verifiedReqsCount = 0;
    let unverifiedReqsCount = 0;

    const reqMatrix = [];
    const evidenceChains = [];

    for (const req of requirements) {
      const assignedTests = registeredTests.filter(t => t.req_id === req.id);
      const hasTests = assignedTests.length > 0;
      if (hasTests) coveredReqsCount++;

      let allPassed = hasTests;
      let hasFail = false;

      const casesData = assignedTests.map(t => {
        const exec = testExecutionMap[t.id];
        const status = exec ? exec.status : 'not-run';
        const defect = defectMap[t.id] || '—';

        if (status !== 'passed') allPassed = false;
        if (status === 'failed' || status === 'error') hasFail = true;

        evidenceChains.push({
          req_id: req.id,
          tc_id: t.id,
          script: t.file || 'unimplemented',
          run_id: results.run_id || 'RUN-NONE',
          result: status === 'passed' ? '✓ PASS' : status === 'failed' ? '✗ FAIL' : '░ UNTESTED',
          defect_id: defect !== '—' ? defect : null,
        });

        return {
          tc_id: t.id,
          test_file: t.file || 'tests/',
          tier: t.tier || 'api',
          result_icon: status === 'passed' ? '✓' : status === 'failed' ? '✗' : '░',
          result: status.toUpperCase(),
          defect_id: defect,
        };
      });

      if (hasTests && allPassed) verifiedReqsCount++;
      if (hasFail) unverifiedReqsCount++;

      reqMatrix.push({
        id: req.id,
        title: req.title,
        test_cases: casesData,
      });
    }

    const uncoveredReqs = requirements.filter(r => (r.testCases || []).length === 0);
    const orphanTests = registeredTests.filter(t => !t.req_id || !reqMap.requirements?.[t.req_id]);

    const totalReqs = requirements.length;
    const coveragePct = totalReqs > 0 ? ((coveredReqsCount / totalReqs) * 100).toFixed(1) : '0.0';
    const verifiedPct = totalReqs > 0 ? ((verifiedReqsCount / totalReqs) * 100).toFixed(1) : '0.0';
    const unverifiedPct = totalReqs > 0 ? ((unverifiedReqsCount / totalReqs) * 100).toFixed(1) : '0.0';
    const uncoveredPct = totalReqs > 0 ? (((totalReqs - coveredReqsCount) / totalReqs) * 100).toFixed(1) : '0.0';

    const template = readProjectTemplate('traceability.template.md', cwd);
    const context = {
      project_name: config.project?.name || path.basename(cwd),
      timestamp: new Date().toISOString(),
      total_requirements: totalReqs,
      covered_requirements: coveredReqsCount,
      coverage_percentage: coveragePct,
      verified_requirements: verifiedReqsCount,
      verified_percentage: verifiedPct,
      unverified_requirements: unverifiedReqsCount,
      unverified_percentage: unverifiedPct,
      uncovered_requirements: totalReqs - coveredReqsCount,
      uncovered_percentage: uncoveredPct,
      total_test_cases: registeredTests.length,
      implemented_test_cases: registeredTests.filter(t => t.file).length,
      executed_test_cases: Object.keys(testExecutionMap).length,
      passed_test_cases: Object.values(testExecutionMap).filter(t => t.status === 'passed').length,
      failed_test_cases: Object.values(testExecutionMap).filter(t => t.status === 'failed' || t.status === 'error').length,
      requirements: reqMatrix,
      orphan_tests: orphanTests.map(t => ({ test_id: t.id, test_file: t.file })),
      uncovered_reqs: uncoveredReqs.map(r => ({ req_id: r.id, title: r.title })),
      evidence_chains: evidenceChains,
      version: '0.1.0',
    };

    const renderedMd = renderTemplate(template, context);
    const mdOutPath = path.resolve(cwd, VERISPEC_DIR, 'traceability.md');
    await fs.writeFile(mdOutPath, renderedMd, 'utf-8');

    // Generate HTML version as well
    const htmlOutPath = path.resolve(cwd, VERISPEC_DIR, 'traceability.html');
    const renderedHtml = generateTraceabilityHtml(context);
    await fs.writeFile(htmlOutPath, renderedHtml, 'utf-8');

    spinner.succeed('Traceability matrix generated successfully');

    // Terminal Summary
    console.log('');
    console.log(chalk.bold('Traceability Metrics:'));
    console.log(`  Requirements:  ${chalk.bold(totalReqs)} total (${chalk.green(`${coveragePct}% covered`)}, ${chalk.green(`${verifiedPct}% verified`)})`);
    console.log(`  Test Cases:    ${chalk.bold(registeredTests.length)} registered, ${chalk.bold(Object.keys(testExecutionMap).length)} executed`);
    console.log(`  Artifacts:     ${chalk.cyan('.verispec/traceability.md')} and ${chalk.cyan('.verispec/traceability.html')}`);
    console.log('');

    console.log(chalk.bold('Requirement Verification Status:'));
    logger.table(
      ['Requirement', 'Assigned Tests', 'Verified TCs', 'Coverage'],
      requirements.map(r => {
        const testsForReq = registeredTests.filter(t => t.req_id === r.id);
        const passedCount = testsForReq.filter(t => testExecutionMap[t.id]?.status === 'passed').length;
        const status = testsForReq.length === 0 ? chalk.red('UNCOVERED') :
                       passedCount === testsForReq.length ? chalk.green('VERIFIED') : chalk.yellow('PARTIAL');
        return [r.id, String(testsForReq.length), `${passedCount}/${testsForReq.length}`, status];
      })
    );
    console.log('');

  } catch (err) {
    spinner.fail(`Traceability matrix generation failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

/**
 * Generate clean HTML dashboard for Traceability
 */
function generateTraceabilityHtml(data) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>VeriSpec Traceability Matrix — ${data.project_name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0e17; color: #e8edf5; padding: 32px; }
    h1, h2 { color: #fff; margin-bottom: 12px; }
    .card { background: #111827; border: 1px solid #2a3548; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #1f2a3e; }
    th { color: #8b95a8; font-size: 13px; text-transform: uppercase; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .badge-pass { background: rgba(6,214,160,0.15); color: #06d6a0; }
    .badge-fail { background: rgba(239,71,111,0.15); color: #ef476f; }
    .badge-idle { background: rgba(255,209,102,0.15); color: #ffd166; }
    code { font-family: monospace; color: #4cc9f0; background: #1a2233; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>VeriSpec Traceability Matrix</h1>
  <p style="color: #8b95a8;">Project: <strong>${data.project_name}</strong> | Generated: ${data.timestamp}</p>

  <div class="card">
    <h2>Coverage Overview</h2>
    <p>Requirements Covered: <strong>${data.coverage_percentage}%</strong> | Verified: <strong>${data.verified_percentage}%</strong></p>
    <table>
      <thead>
        <tr><th>Metric</th><th>Count</th><th>Ratio</th></tr>
      </thead>
      <tbody>
        <tr><td>Total Requirements</td><td>${data.total_requirements}</td><td>100%</td></tr>
        <tr><td>Covered Requirements</td><td>${data.covered_requirements}</td><td>${data.coverage_percentage}%</td></tr>
        <tr><td>Verified Requirements</td><td>${data.verified_requirements}</td><td>${data.verified_percentage}%</td></tr>
        <tr><td>Total Test Cases</td><td>${data.total_test_cases}</td><td>—</td></tr>
      </tbody>
    </table>
  </div>

  <div class="card">
    <h2>Chain of Evidence</h2>
    <table>
      <thead>
        <tr><th>Requirement</th><th>Test Case</th><th>Script File</th><th>Status</th><th>Defect</th></tr>
      </thead>
      <tbody>
        ${data.evidence_chains.map(e => `
          <tr>
            <td><code>${e.req_id}</code></td>
            <td><code>${e.tc_id}</code></td>
            <td><code>${e.script}</code></td>
            <td><span class="badge ${e.result.includes('PASS') ? 'badge-pass' : e.result.includes('FAIL') ? 'badge-fail' : 'badge-idle'}">${e.result}</span></td>
            <td>${e.defect_id ? `<code>${e.defect_id}</code>` : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}
