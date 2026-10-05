/**
 * VeriSpec Strategy Command
 * 
 * Analyzes spec.md (greenfield) or discovers codebase features (brownfield),
 * performs risk-based test allocation across tiers, and generates .verispec/strategy.md.
 */

import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import crypto from 'crypto';
import ora from 'ora';
import chalk from 'chalk';
import {
  requireInit,
  readConfig,
  readProjectTemplate,
  renderTemplate,
  writeRequirementMap,
  writeRequirements,
  VERISPEC_DIR,
} from '../utils/file-utils.js';
import { featurePrefix, generateReqId } from '../utils/id-generator.js';
import { logger } from '../utils/logger.js';

export async function strategyCommand(options) {
  const cwd = process.cwd();
  requireInit(cwd);
  logger.banner('VeriSpec Test Strategy Generator');

  const config = await readConfig(cwd);
  const specPath = options.spec || config.project?.spec_path || 'spec.md';
  const fullSpecPath = path.resolve(cwd, specPath);

  const spinner = ora('Analyzing requirements and assessing risk...').start();

  let featureName = config.project?.name || path.basename(cwd);
  let requirements = [];
  let isBrownfield = options.brownfield || !fs.existsSync(fullSpecPath);

  try {
    if (isBrownfield) {
      spinner.text = 'Scanning codebase for feature discovery (brownfield mode)...';
      const discovered = await discoverBrownfieldRequirements(cwd);
      requirements = discovered.requirements;
      featureName = discovered.featureName || featureName;
      spinner.succeed(`Discovered ${requirements.length} requirement candidates from codebase`);
    } else {
      spinner.text = `Parsing specification from ${specPath}...`;
      const specContent = await fs.readFile(fullSpecPath, 'utf-8');
      const parsed = parseSpecification(specContent, featureName);
      requirements = parsed.requirements;
      if (parsed.featureName) featureName = parsed.featureName;
      spinner.succeed(`Extracted ${requirements.length} requirements from ${specPath}`);
    }

    if (requirements.length === 0) {
      // Create a default baseline requirement if none found
      const prefix = featurePrefix(featureName);
      requirements.push({
        id: `REQ-${prefix}-001`,
        title: `${featureName} Core Workflow`,
        description: `Verify that ${featureName} executes the main business workflow correctly under normal conditions.`,
        risk_level: 'High',
        failure_impact: 'Business disruption / core functionality unusable',
        risk_justification: 'Core feature operation',
        unit: '✓',
        api: '✓',
        integration: '✓',
        e2e: '✓',
        security: '—',
        performance: '—',
      });
    }

    // 2. Build test tier strategy matrix
    const strategyMatrix = requirements.map(r => {
      // Risk-based allocation according to rulebook principles
      const isAuthOrSec = /auth|permission|role|token|credential|security|password|access/i.test(r.title + ' ' + r.description);
      const isCritical = r.risk_level === 'Critical';
      const isHigh = r.risk_level === 'High';
      const isPerf = /latency|throughput|load|performance|traffic|scale/i.test(r.title + ' ' + r.description);

      const unit = '✓';
      const api = isCritical || isHigh || isAuthOrSec || /api|endpoint|request/i.test(r.title + ' ' + r.description) ? '✓' : '—';
      const integration = isCritical || isHigh || /database|store|persist|event|queue/i.test(r.title + ' ' + r.description) ? '✓' : '—';
      const e2e = isCritical || (isHigh && !r.title.toLowerCase().includes('validation')) ? '✓' : '—';
      const security = isAuthOrSec || isCritical ? '✓' : '—';
      const performance = isPerf ? '✓' : '—';

      return {
        req_id: r.id,
        unit,
        api,
        integration,
        e2e,
        security,
        performance,
      };
    });

    // 3. Render strategy.md
    const template = readProjectTemplate('strategy.template.md', cwd);
    const context = {
      feature_name: featureName,
      spec_path: isBrownfield ? '(Brownfield Codebase Discovery)' : specPath,
      timestamp: new Date().toISOString(),
      language: config.project?.language || 'python',
      frameworks: (config.project?.frameworks || []).join(', ') || 'native',
      requirements: requirements.map((r, i) => ({
        ...r,
        unit: strategyMatrix[i]?.unit,
        api: strategyMatrix[i]?.api,
        integration: strategyMatrix[i]?.integration,
        e2e: strategyMatrix[i]?.e2e,
        security: strategyMatrix[i]?.security,
        performance: strategyMatrix[i]?.performance,
      })),
      strategy_matrix: strategyMatrix,
      test_data: [
        { category: 'Valid Payloads', description: 'Deterministic standard fixtures with valid entity relationships' },
        { category: 'Invalid / Boundary Payloads', description: 'Missing mandatory fields, invalid data types, oversized inputs' },
        { category: 'Security Personas', description: 'Unauthenticated, unauthorized role, and authorized administrator tokens' },
      ],
      environments: [
        { name: 'Local Test Environment', description: 'Isolated in-memory / test SQLite or test container database' },
        { name: 'CI Pipeline', description: 'Ephemeral containerized execution with automated fixtures' },
      ],
      dependencies: [
        { description: 'Database migrations must be applied before integration tests run.' },
        { description: 'Mock external third-party services during Unit and API execution tiers.' },
      ],
      rationale: `Testing depth is allocated proportionally to business risk according to VeriSpec Rulebook Principle #2. Critical requirements require multi-tier validation across API, Integration, and E2E tiers. Security tests are assigned to authentication-sensitive and authorization boundaries.`,
      version: '0.1.0',
    };

    const rendered = renderTemplate(template, context);
    const strategyOutPath = path.resolve(cwd, VERISPEC_DIR, 'strategy.md');
    await fs.writeFile(strategyOutPath, rendered, 'utf-8');

    // 4. Update state/requirement-map.json
    const reqMap = {
      feature: featureName,
      lastUpdated: new Date().toISOString(),
      requirements: {},
    };

    requirements.forEach((r, i) => {
      reqMap.requirements[r.id] = {
        id: r.id,
        title: r.title,
        description: r.description,
        risk_level: r.risk_level,
        tiers: {
          unit: strategyMatrix[i].unit === '✓',
          api: strategyMatrix[i].api === '✓',
          integration: strategyMatrix[i].integration === '✓',
          e2e: strategyMatrix[i].e2e === '✓',
          security: strategyMatrix[i].security === '✓',
          performance: strategyMatrix[i].performance === '✓',
        },
        testCases: [],
      };
    });

    await writeRequirementMap(reqMap, cwd);

    // 4b. Update state/requirements.json (Stable Requirements Graph with Hashes)
    const stableReqs = {
      feature: featureName,
      source: isBrownfield ? '(Brownfield Codebase Discovery)' : specPath,
      lastUpdated: new Date().toISOString(),
      requirements: {},
    };

    requirements.forEach((r) => {
      const hash = crypto.createHash('sha256').update(`${r.title}\n${r.description}`).digest('hex').slice(0, 16);
      stableReqs.requirements[r.id] = {
        id: r.id,
        title: r.title,
        description: r.description,
        risk_level: r.risk_level,
        hash,
        source: isBrownfield ? '(Brownfield Discovery)' : specPath,
        section: r.section || r.title,
      };
    });

    await writeRequirements(stableReqs, cwd);

    // 5. Output Summary to Terminal
    console.log('');
    logger.success(`Test Strategy written to: ${chalk.cyan('.verispec/strategy.md')}`);
    console.log('');

    console.log(chalk.bold('Risk & Test Level Strategy Matrix:'));
    logger.table(
      ['Requirement', 'Risk', 'Unit', 'API', 'Integ', 'E2E', 'Sec'],
      requirements.map((r, i) => [
        r.id,
        r.risk_level,
        strategyMatrix[i].unit,
        strategyMatrix[i].api,
        strategyMatrix[i].integration,
        strategyMatrix[i].e2e,
        strategyMatrix[i].security,
      ])
    );

    console.log('');
    logger.info(`Next step: Run ${chalk.cyan('verispec cases')} to generate test cases with stable IDs.`);
    console.log('');

  } catch (err) {
    spinner.fail(`Strategy generation failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

/**
 * Parse specification markdown into structured requirements
 */
function parseSpecification(content, defaultFeature) {
  const requirements = [];
  const lines = content.split('\n');
  let currentReq = null;
  let featureName = defaultFeature;

  for (const line of lines) {
    // Feature title: # Specification: Feature Name or # Feature Name
    if (/^#\s+(?:Test Specification:?\s*|Specification:?\s*)?(.+)/i.test(line) && featureName === defaultFeature) {
      const match = line.match(/^#\s+(?:Test Specification:?\s*|Specification:?\s*)?(.+)/i);
      if (match) featureName = match[1].trim();
    }

    // Heading: ### REQ-xxx or ### REQ-... or ### Requirement 1: ...
    const reqHeadingMatch = line.match(/^#{2,4}\s+(REQ-[A-Z0-9_-]+|Requirement\s+\d+)(?::\s*|\s*-\s*|\s+)?(.*)/i);
    if (reqHeadingMatch) {
      if (currentReq) requirements.push(finalizeReq(currentReq, featureName, requirements.length + 1));
      currentReq = {
        rawId: reqHeadingMatch[1],
        title: reqHeadingMatch[2].trim() || reqHeadingMatch[1],
        descriptionLines: [],
        risk: 'High',
      };
      continue;
    }

    // Bullet points like: - **REQ-001**: Description or - REQ-001: Description
    const bulletMatch = line.match(/^[-*]\s+\*{0,2}(REQ-[A-Z0-9_-]+)\*{0,2}(?::\s*|\s*-\s*)(.*)/i);
    if (bulletMatch) {
      if (currentReq) requirements.push(finalizeReq(currentReq, featureName, requirements.length + 1));
      currentReq = {
        rawId: bulletMatch[1],
        title: bulletMatch[2].trim() || bulletMatch[1],
        descriptionLines: [bulletMatch[2].trim()],
        risk: 'High',
      };
      continue;
    }

    if (currentReq) {
      // Risk tag in text: Risk: Critical | High | Medium | Low
      const riskMatch = line.match(/Risk:\s*(Critical|High|Medium|Low)/i);
      if (riskMatch) {
        currentReq.risk = riskMatch[1];
      }
      if (line.trim().length > 0 && !line.startsWith('#')) {
        currentReq.descriptionLines.push(line.trim());
      }
    }
  }

  if (currentReq) {
    requirements.push(finalizeReq(currentReq, featureName, requirements.length + 1));
  }

  // Fallback 1: If no REQ- tags were found, look for bullet points under ## Requirements
  if (requirements.length === 0) {
    let inReqSection = false;
    for (const line of lines) {
      if (/^#{2,3}\s+.*Requirements/i.test(line)) {
        inReqSection = true;
        continue;
      }
      if (inReqSection && line.startsWith('## ')) {
        inReqSection = false;
      }
      if (inReqSection && /^[-*]\s+(.+)/.test(line)) {
        const item = line.match(/^[-*]\s+(.+)/)[1].trim();
        const prefix = featurePrefix(featureName);
        const seq = String(requirements.length + 1).padStart(3, '0');
        requirements.push({
          id: `REQ-${prefix}-${seq}`,
          title: item.slice(0, 50),
          description: item,
          risk_level: determineRisk(item),
          failure_impact: 'Workflow failure',
          risk_justification: 'Extracted from specification requirements',
          section: item.slice(0, 50),
        });
      }
    }
  }

  // Fallback 2: If still no requirements found, treat ### section headings as feature requirements
  if (requirements.length === 0) {
    let currentSec = null;
    for (const line of lines) {
      const headingMatch = line.match(/^#{2,3}\s+(.+)/);
      if (headingMatch) {
        const title = headingMatch[1].trim();
        if (!/objective|overview|summary|introduction|architecture|tech stack|scope|references/i.test(title)) {
          if (currentSec) requirements.push(finalizeReq(currentSec, featureName, requirements.length + 1));
          currentSec = {
            rawId: '',
            title: title,
            descriptionLines: [],
            risk: 'High',
            section: title,
          };
          continue;
        }
      }
      if (currentSec && line.trim().length > 0 && !line.startsWith('#')) {
        currentSec.descriptionLines.push(line.trim());
      }
    }
    if (currentSec) {
      requirements.push(finalizeReq(currentSec, featureName, requirements.length + 1));
    }
  }

  return { featureName, requirements };
}

function finalizeReq(raw, featureName, seqNumber) {
  const prefix = featurePrefix(featureName);
  const normalizedId = raw.rawId && raw.rawId.startsWith('REQ-') && raw.rawId.includes('-0') 
    ? raw.rawId.toUpperCase() 
    : `REQ-${prefix}-${String(seqNumber).padStart(3, '0')}`;
  
  const desc = raw.descriptionLines.join(' ').trim() || raw.title;
  const risk = raw.risk || determineRisk(raw.title + ' ' + desc);

  return {
    id: normalizedId,
    title: raw.title || `Requirement ${seqNumber}`,
    description: desc,
    risk_level: risk,
    section: raw.section || raw.title,
    failure_impact: risk === 'Critical' ? 'System unavailability / severe security violation' :
                    risk === 'High' ? 'Core business workflow failure' :
                    risk === 'Medium' ? 'Validation or degradation issue' : 'Minor defect',
    risk_justification: `Based on domain risk analysis (${risk})`,
  };
}

function determineRisk(text) {
  const lower = text.toLowerCase();
  if (/security|auth|unauthorized|privilege|credential|token|data integrity|payment|billing|duplicate/i.test(lower)) {
    return 'Critical';
  }
  if (/mandatory|create|update|delete|save|database|workflow|primary|order|transaction/i.test(lower)) {
    return 'High';
  }
  if (/validate|format|limit|search|filter|list|sort/i.test(lower)) {
    return 'Medium';
  }
  return 'Low';
}

/**
 * Discover requirement candidates from brownfield codebases
 */
async function discoverBrownfieldRequirements(cwd) {
  const requirements = [];
  const featureName = path.basename(cwd);
  const prefix = featurePrefix(featureName);

  // Scan for API endpoints in Python or JS/TS
  const apiFiles = await glob('**/{routes,routers,api,controllers,endpoints}/**/*.{py,js,ts}', {
    cwd,
    ignore: ['node_modules/**', '.venv/**', '.verispec/**', 'tests/**'],
    maxDepth: 4,
  });

  let seq = 1;

  for (const file of apiFiles.slice(0, 10)) {
    const content = await fs.readFile(path.resolve(cwd, file), 'utf-8');
    // Match route decorators like @router.get("/..."), app.post("...")
    const routeMatches = content.matchAll(/(?:@(?:router|app)\.(get|post|put|delete|patch)|router\.(get|post|put|delete))\s*\(\s*["']([^"']+)["']/g);
    for (const m of routeMatches) {
      const method = (m[1] || m[2]).toUpperCase();
      const endpoint = m[3];
      const id = `REQ-${prefix}-${String(seq).padStart(3, '0')}`;
      seq++;

      const isWrite = ['POST', 'PUT', 'DELETE'].includes(method);
      requirements.push({
        id,
        title: `${method} ${endpoint}`,
        description: `Verify correct response and error handling for endpoint: ${method} ${endpoint}`,
        risk_level: isWrite ? 'High' : 'Medium',
        failure_impact: isWrite ? 'Data modification failure' : 'Data query failure',
        risk_justification: `Discovered from API route in ${file}`,
      });
    }
  }

  return { featureName, requirements };
}
