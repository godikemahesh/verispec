/**
 * VeriSpec Analyze Command
 * 
 * Intelligent failure analysis engine: inspects test outputs, stack traces,
 * requirements, and source code to classify defects and produce structured defect cards.
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import {
  requireInit,
  readProjectTemplate,
  renderTemplate,
  LATEST_REPORT_DIR,
  DEFECTS_DIR,
  readRequirementMap,
  readTestRegistry,
} from '../utils/file-utils.js';
import { generateDefectId, featurePrefix } from '../utils/id-generator.js';
import { logger } from '../utils/logger.js';

export async function analyzeCommand(options) {
  const cwd = process.cwd();
  requireInit(cwd);
  logger.banner('VeriSpec Failure Intelligence & Defect Analysis');

  const resultsPath = path.resolve(cwd, LATEST_REPORT_DIR, 'results.json');

  // 1. Verify test results exist
  if (!fs.existsSync(resultsPath)) {
    logger.warn('No VeriSpec test results found.');
    console.log('');
    console.log('Execute tests first:');
    console.log(`  ${chalk.cyan('verispec run')} or ${chalk.cyan('pytest')}`);
    console.log('');
    console.log('Then execute:');
    console.log(`  ${chalk.cyan('verispec analyze')}`);
    console.log('');
    return;
  }

  const results = await fs.readJSON(resultsPath);

  // 2. Filter failures
  const tests = results.tests || [];
  const failedTests = tests.filter(t => t.status === 'failed' || t.status === 'error');

  if (failedTests.length === 0) {
    logger.success(`All ${tests.length} tests in run ${results.run_id || 'latest'} passed!`);
    console.log(chalk.green('✓ No failures or defects detected.'));
    console.log('');
    logger.info(`Run ${chalk.cyan('verispec trace')} to generate the complete traceability matrix.`);
    return;
  }

  const spinner = ora(`Analyzing ${failedTests.length} test failure(s)...`).start();
  const reqMap = await readRequirementMap(cwd);
  const registry = await readTestRegistry(cwd);
  const defectsDir = path.resolve(cwd, DEFECTS_DIR);
  await fs.ensureDir(defectsDir);

  const defectTemplate = readProjectTemplate('defect.template.md', cwd);
  const generatedDefects = [];

  try {
    for (const failed of failedTests) {
      const tcId = failed.tc_id || failed.id || 'TC-UNKNOWN';
      const reqId = failed.req_id || 'REQ-UNKNOWN';
      const reqInfo = reqMap.requirements?.[reqId] || {};

      // Determine feature name for ID generation
      const featureName = reqMap.feature || path.basename(cwd);
      const rawDefectId = await generateDefectId(featureName, cwd);

      // Perform root cause heuristics and failure classification
      const analysis = performHeuristicAnalysis(failed, reqInfo);
      const defectId = analysis.isProductDefect ? rawDefectId : rawDefectId.replace(/^BUG-/, 'DIAG-');

      const defectData = {
        defect_id: defectId,
        timestamp: new Date().toISOString(),
        classification: analysis.classification,
        is_product_defect: analysis.isProductDefect,
        suggested_action: analysis.suggestedAction,
        confidence: analysis.confidence,
        summary: `Failure in ${failed.name || failed.function || tcId}: ${analysis.summary}`,
        test_case_id: tcId,
        requirement_id: reqId,
        test_file: failed.file || 'unknown',
        test_function: failed.function || failed.name || 'unknown',
        severity: reqInfo.risk_level === 'Critical' ? 'Critical' : 'High',
        run_id: results.run_id || 'RUN-LATEST',
        expected_behavior: reqInfo.description || 'Test assertion should succeed.',
        actual_behavior: failed.error_message || 'Assertion failed during test execution.',
        error_output: (failed.error_message || 'No error message captured').trim(),
        stack_trace: (failed.stack_trace || failed.stdout || 'No stack trace captured').trim(),
        root_cause: analysis.rootCause,
        evidence: [
          `Failed test case: ${tcId}`,
          `Associated requirement: ${reqId}`,
          `Exit error: ${failed.error_message || 'AssertionError'}`,
          `Classification: ${analysis.classification} (${analysis.confidence}% confidence)`,
          `Suggested remediation: ${analysis.suggestedAction}`,
        ],
        suggested_files: analysis.suggestedFiles,
        status: analysis.isProductDefect ? 'OPEN_BUG' : 'DIAGNOSED_NON_BUG',
        version: '0.1.0',
      };

      const renderedDefect = renderTemplate(defectTemplate, defectData);
      const defectFilePath = path.join(defectsDir, `${defectId}.md`);
      await fs.writeFile(defectFilePath, renderedDefect, 'utf-8');

      generatedDefects.push({
        defectId,
        tcId,
        reqId,
        classification: analysis.classification,
        isProductDefect: analysis.isProductDefect,
        suggestedAction: analysis.suggestedAction,
        confidence: analysis.confidence,
        filePath: path.relative(cwd, defectFilePath).replace(/\\/g, '/'),
      });
    }

    // Update results.json with defect references
    results.defects = generatedDefects.map(d => ({
      id: d.defectId,
      tc_id: d.tcId,
      req_id: d.reqId,
      classification: d.classification,
      is_product_defect: d.isProductDefect,
      suggested_action: d.suggestedAction,
    }));
    await fs.writeJSON(resultsPath, results, { spaces: 2 });

    const bugCount = generatedDefects.filter(d => d.isProductDefect).length;
    const nonBugCount = generatedDefects.length - bugCount;
    spinner.succeed(`Classified ${generatedDefects.length} failure(s): ${bugCount} Product Defect(s), ${nonBugCount} Non-Bug Issue(s) in .verispec/defects/`);

    // Output formatted report
    console.log('');
    console.log(chalk.bold.red('Failure Classification & Root-Cause Triage:'));
    logger.table(
      ['Card ID', 'Failed Test', 'Requirement', 'Classification', 'Confidence', 'Action / Status'],
      generatedDefects.map(d => [
        d.defectId,
        d.tcId,
        d.reqId,
        d.isProductDefect ? chalk.red(d.classification) : chalk.yellow(d.classification),
        `${d.confidence}%`,
        d.isProductDefect ? chalk.red('Product Defect Card Drafted') : chalk.cyan(d.suggestedAction),
      ])
    );

    console.log('');
    console.log(chalk.bold('Investigation Details:'));
    generatedDefects.forEach(d => {
      const color = d.isProductDefect ? chalk.red : chalk.yellow;
      console.log(`  ${color('●')} ${chalk.bold(d.defectId)} [${d.classification} - ${d.confidence}% confidence]`);
      console.log(`    File: ${chalk.cyan(d.filePath)}`);
      console.log(`    Action: ${chalk.dim(d.suggestedAction)}`);
    });
    console.log('');

  } catch (err) {
    spinner.fail(`Analysis failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

/**
 * Heuristic root cause analyzer
 */
function performHeuristicAnalysis(failedTest, reqInfo) {
  const errMsg = (failedTest.error_message || '').toLowerCase();
  const stack = (failedTest.stack_trace || '').toLowerCase();
  const combined = errMsg + ' ' + stack;

  let classification = 'LIKELY DEFECT';
  let confidence = 85;
  let rootCause = 'The application logic did not meet the requirement assertion.';
  let summary = 'Assertion failed during verification.';
  const suggestedFiles = [];

  // Extract file mentions from stack trace
  const fileMatches = (failedTest.stack_trace || '').matchAll(/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:py|js|ts)/g);
  for (const match of fileMatches) {
    const f = match[0];
    if (!f.startsWith('tests/') && !f.includes('conftest') && !f.includes('node_modules') && !f.includes('.venv')) {
      if (!suggestedFiles.includes(f)) suggestedFiles.push(f);
    }
  }

  if (suggestedFiles.length === 0 && failedTest.file) {
    suggestedFiles.push(failedTest.file);
  }

  // Heuristic patterns for 5-tier failure classification
  if (combined.includes('401') || combined.includes('unauthorized') || combined.includes('forbidden')) {
    classification = 'PRODUCT DEFECT';
    confidence = 92;
    summary = 'Authentication / Authorization enforcement failure';
    rootCause = 'Endpoint access control or token validation failed to enforce required security policy.';
  } else if (combined.includes('idempotency') || combined.includes('duplicate') || combined.includes('integrityerror')) {
    classification = 'PRODUCT DEFECT';
    confidence = 94;
    summary = 'Duplicate submission / Idempotency handling missing';
    rootCause = 'Multiple rapid or concurrent requests create duplicate records without deduplication or database constraint.';
  } else if (combined.includes('404') || combined.includes('not found')) {
    classification = 'PRODUCT DEFECT';
    confidence = 88;
    summary = 'Route or resource not found';
    rootCause = 'Target endpoint route is unregistered or resource identifier lookup failed unexpectedly.';
  } else if (combined.includes('422') || combined.includes('validation error') || combined.includes('bad request')) {
    classification = 'PRODUCT DEFECT';
    confidence = 90;
    summary = 'Input validation schema mismatch';
    rootCause = 'Request payload schema does not match backend model validation criteria.';
  } else if (combined.includes('connection refused') || combined.includes('timeout') || combined.includes('operationalerror') || combined.includes('502') || combined.includes('503')) {
    classification = 'ENVIRONMENT ISSUE';
    confidence = 85;
    summary = 'Service connection timeout or infrastructure unavailability';
    rootCause = 'Test environment service, network gateway, or database connection was unavailable during execution.';
  } else if (combined.includes('token expired') || combined.includes('fixture') || combined.includes('no such table') || combined.includes('seed')) {
    classification = 'TEST DATA PROBLEM';
    confidence = 88;
    summary = 'Fixture or prerequisite test data unavailable';
    rootCause = 'Test fixture seeding or prerequisite session token expired before assertion execution.';
  } else if (combined.includes('importerror') || combined.includes('modulenotfounderror') || combined.includes('syntaxerror') || combined.includes('attributeerror')) {
    classification = 'TEST DEFECT';
    confidence = 95;
    summary = 'Test implementation syntax, selector, or dependency error';
    rootCause = 'Test script contains invalid imports, outdated selectors, or syntax errors preventing proper execution.';
  } else if (combined.includes('expected') && combined.includes('received')) {
    classification = 'PRODUCT DEFECT';
    confidence = 82;
    summary = 'Assertion value mismatch against specification';
    rootCause = 'Application returned unexpected status code or response payload inconsistent with requirement.';
  }

  const isProductDefect = classification === 'PRODUCT DEFECT';
  const suggestedAction = isProductDefect
    ? 'Inspect application business logic in suggested source files.'
    : classification === 'ENVIRONMENT ISSUE'
    ? 'Verify database/service availability and network connectivity.'
    : classification === 'TEST DATA PROBLEM'
    ? 'Re-seed test fixtures and verify authentication tokens.'
    : 'Repair test script implementation, mock, or selector.';

  return { classification, confidence, summary, rootCause, suggestedFiles, isProductDefect, suggestedAction };
}
