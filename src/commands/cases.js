/**
 * VeriSpec Cases Command
 * 
 * Generates structured, deterministic test cases with stable IDs
 * from the approved test strategy, organized by category into .verispec/cases/.
 */

import fs from 'fs-extra';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import {
  requireInit,
  readConfig,
  readRequirementMap,
  writeRequirementMap,
  readProjectTemplate,
  renderTemplate,
  CASES_DIR,
  VERISPEC_DIR,
} from '../utils/file-utils.js';
import { featurePrefix, generateTestCaseId } from '../utils/id-generator.js';
import { logger } from '../utils/logger.js';

export async function casesCommand(options) {
  const cwd = process.cwd();
  requireInit(cwd);
  logger.banner('VeriSpec Test Case Generator');

  const reqMap = await readRequirementMap(cwd);
  const requirements = Object.values(reqMap.requirements || {});

  if (requirements.length === 0) {
    logger.error('No requirements found in .verispec/state/requirement-map.json.');
    logger.info('Run: verispec strategy first.');
    return;
  }

  const spinner = ora('Designing structured test cases with stable IDs...').start();
  const config = await readConfig(cwd);
  const featureName = reqMap.feature || config.project?.name || path.basename(cwd);
  const prefix = featurePrefix(featureName);

  try {
    const categoriesToGen = (options.categories || 'functional,negative,boundary,security')
      .split(',')
      .map(c => c.trim().toLowerCase());

    const casesByCategory = {
      functional: [],
      negative: [],
      boundary: [],
      security: [],
    };

    const allGeneratedCases = [];

    for (const req of requirements) {
      req.testCases = [];

      // ─── 1. Functional Test Cases (Happy Path) ───
      if (categoriesToGen.includes('functional')) {
        const tcId = await generateTestCaseId(featureName, cwd);
        const functionalCase = {
          id: tcId,
          requirement_id: req.id,
          requirement_title: req.title,
          title: `Verify ${req.title} with valid inputs`,
          type: req.tiers?.e2e ? 'E2E' : req.tiers?.api ? 'API' : 'Unit',
          priority: req.risk_level === 'Critical' ? 'P0' : req.risk_level === 'High' ? 'P1' : 'P2',
          risk: req.risk_level,
          category: 'Functional',
          preconditions: [
            'System environment is initialized with test database fixtures',
            'Authorized user session/token is available',
          ],
          steps: [
            { step_number: 1, description: `Prepare valid payload for ${req.title}`, has_payload: false },
            { step_number: 2, description: 'Send request / invoke workflow', has_payload: false },
            { step_number: 3, description: 'Verify state persistence and response payload', has_payload: false },
          ],
          expected: [
            'Operation completes successfully with 2xx HTTP status or expected return model',
            'Entity record is persisted accurately in the database',
            'Response body conforms to output schema',
          ],
          test_data: ['Valid entity fixture with required and optional fields populated'],
        };
        casesByCategory.functional.push(functionalCase);
        req.testCases.push(tcId);
        allGeneratedCases.push(functionalCase);
      }

      // ─── 2. Negative Test Cases ───
      if (categoriesToGen.includes('negative')) {
        const tcId = await generateTestCaseId(featureName, cwd);
        const negativeCase = {
          id: tcId,
          requirement_id: req.id,
          requirement_title: req.title,
          title: `Reject ${req.title} with missing mandatory fields`,
          type: req.tiers?.api ? 'API' : 'Unit',
          priority: 'P1',
          risk: 'Medium',
          category: 'Negative',
          preconditions: ['System environment is active'],
          steps: [
            { step_number: 1, description: 'Omit mandatory attributes from request payload', has_payload: false },
            { step_number: 2, description: 'Submit invalid request', has_payload: false },
            { step_number: 3, description: 'Inspect error status and validation message', has_payload: false },
          ],
          expected: [
            'Operation fails with HTTP 400 Bad Request or 422 Unprocessable Entity',
            'Meaningful validation error details are returned specifying the missing fields',
            'No state or database record is created or modified',
          ],
          test_data: ['Payload with null, empty, or omitted required fields'],
        };
        casesByCategory.negative.push(negativeCase);
        req.testCases.push(tcId);
        allGeneratedCases.push(negativeCase);
      }

      // ─── 3. Boundary Test Cases ───
      if (categoriesToGen.includes('boundary')) {
        const tcId = await generateTestCaseId(featureName, cwd);
        const boundaryCase = {
          id: tcId,
          requirement_id: req.id,
          requirement_title: req.title,
          title: `Boundary limits and character thresholds for ${req.title}`,
          type: req.tiers?.api ? 'API' : 'Unit',
          priority: 'P2',
          risk: 'Medium',
          category: 'Boundary',
          preconditions: ['Test environment active'],
          steps: [
            { step_number: 1, description: 'Construct payload with max length string, zero values, and edge boundary numbers', has_payload: false },
            { step_number: 2, description: 'Submit request and verify limit enforcement', has_payload: false },
          ],
          expected: [
            'Inputs within maximum limits succeed',
            'Inputs exceeding boundary limits are rejected with appropriate validation message',
          ],
          test_data: ['Edge values: 0, -1, max string length (255+ chars), special characters'],
        };
        casesByCategory.boundary.push(boundaryCase);
        req.testCases.push(tcId);
        allGeneratedCases.push(boundaryCase);
      }

      // ─── 4. Security Test Cases ───
      if (categoriesToGen.includes('security') && (req.risk_level === 'Critical' || req.tiers?.security)) {
        const tcId = await generateTestCaseId(featureName, cwd);
        const securityCase = {
          id: tcId,
          requirement_id: req.id,
          requirement_title: req.title,
          title: `Prevent unauthorized access to ${req.title}`,
          type: 'Security',
          priority: 'P0',
          risk: 'Critical',
          category: 'Security',
          preconditions: ['Test environment initialized with role-based access control'],
          steps: [
            { step_number: 1, description: 'Attempt invocation without authentication token', has_payload: false },
            { step_number: 2, description: 'Attempt invocation with invalid/expired token', has_payload: false },
            { step_number: 3, description: 'Attempt invocation with insufficient role permissions', has_payload: false },
          ],
          expected: [
            'Unauthenticated request returns HTTP 401 Unauthorized',
            'Unauthorized role returns HTTP 403 Forbidden',
            'No sensitive internal exception details are leaked in error responses',
          ],
          test_data: ['Empty Authorization header', 'Expired JWT token', 'Role: viewer (read-only)'],
        };
        casesByCategory.security.push(securityCase);
        req.testCases.push(tcId);
        allGeneratedCases.push(securityCase);
      }
    }

    // Write category markdown files to .verispec/cases/
    const template = readProjectTemplate('cases.template.md', cwd);
    const targetCasesDir = path.resolve(cwd, CASES_DIR);
    await fs.ensureDir(targetCasesDir);

    for (const [catName, testCases] of Object.entries(casesByCategory)) {
      if (testCases.length === 0) continue;

      const traceability = requirements.map(r => ({
        req_id: r.id,
        case_ids: testCases.filter(t => t.requirement_id === r.id).map(t => t.id).join(', ') || '—',
        coverage_status: testCases.some(t => t.requirement_id === r.id) ? 'Covered' : 'None',
      }));

      const context = {
        category: catName.charAt(0).toUpperCase() + catName.slice(1),
        feature_name: featureName,
        timestamp: new Date().toISOString(),
        test_cases: testCases,
        traceability,
        version: '0.1.0',
      };

      const rendered = renderTemplate(template, context);
      await fs.writeFile(path.join(targetCasesDir, `${catName}.md`), rendered, 'utf-8');
    }

    // Save updated requirement map
    await writeRequirementMap(reqMap, cwd);

    spinner.succeed(`Generated ${allGeneratedCases.length} structured test cases across ${Object.keys(casesByCategory).length} categories`);

    // Output summary
    console.log('');
    console.log(chalk.bold('Test Cases Generated by Category:'));
    console.log(`  ${chalk.green('✓')} Functional: ${chalk.bold(casesByCategory.functional.length)} cases (.verispec/cases/functional.md)`);
    console.log(`  ${chalk.green('✓')} Negative:   ${chalk.bold(casesByCategory.negative.length)} cases (.verispec/cases/negative.md)`);
    console.log(`  ${chalk.green('✓')} Boundary:   ${chalk.bold(casesByCategory.boundary.length)} cases (.verispec/cases/boundary.md)`);
    console.log(`  ${chalk.green('✓')} Security:   ${chalk.bold(casesByCategory.security.length)} cases (.verispec/cases/security.md)`);
    console.log('');

    console.log(chalk.bold('Requirement-to-Test-Case Traceability:'));
    logger.table(
      ['Requirement', 'Title', 'Test Cases Assigned'],
      requirements.map(r => [r.id, r.title, (r.testCases || []).join(', ') || '—'])
    );

    console.log('');
    logger.info(`Next step: Run ${chalk.cyan('verispec implement')} to scaffold native test scripts.`);
    console.log('');

  } catch (err) {
    spinner.fail(`Test case generation failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}
