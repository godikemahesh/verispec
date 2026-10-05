/**
 * VeriSpec Agent Installer
 * 
 * Configures the project environment for AI coding agents:
 * Claude Code, GitHub Copilot, Cursor, Google Antigravity, and Windsurf.
 * Generates slash commands, rules, prompts, and context bindings.
 */

import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger.js';

export const SUPPORTED_AGENTS = ['claude', 'copilot', 'cursor', 'antigravity', 'windsurf', 'all'];

/**
 * Main entry point: installs bindings for specified agent(s)
 */
export async function installAgentBindings(agent = 'all', cwd = process.cwd()) {
  const agentsToInstall = agent === 'all' 
    ? ['claude', 'copilot', 'cursor', 'antigravity', 'windsurf'] 
    : [agent.toLowerCase()];

  const installed = [];

  for (const ag of agentsToInstall) {
    switch (ag) {
      case 'claude':
        await installClaudeBindings(cwd);
        installed.push('Claude Code');
        break;
      case 'copilot':
        await installCopilotBindings(cwd);
        installed.push('GitHub Copilot');
        break;
      case 'cursor':
        await installCursorBindings(cwd);
        installed.push('Cursor');
        break;
      case 'antigravity':
        await installAntigravityBindings(cwd);
        installed.push('Google Antigravity');
        break;
      case 'windsurf':
        await installWindsurfBindings(cwd);
        installed.push('Windsurf');
        break;
      default:
        logger.warn(`Unknown agent type: ${ag}. Skipping.`);
    }
  }

  return installed;
}

/**
 * 1. Claude Code Bindings
 * Creates CLAUDE.md and .claude/commands/ slash command definitions
 */
async function installClaudeBindings(cwd) {
  const claudeMdPath = path.resolve(cwd, 'CLAUDE.md');
  const commandsDir = path.resolve(cwd, '.claude', 'commands');
  await fs.ensureDir(commandsDir);

  const claudeMdContent = `# VeriSpec — Quality Engineering Instructions for Claude Code

This project uses **VeriSpec** for Spec-Driven Quality Engineering.
You must adhere to the following workflow, rules, and commands.

## Core Rules

1. **Development owns \`spec.md\`**: Do not delete or overwrite \`spec.md\`. VeriSpec consumes it.
2. **Deterministic Traceability**:
   - Every requirement has an ID: \`REQ-<FEATURE>-<SEQ>\` (e.g., \`REQ-JC-001\`)
   - Every test case has an ID: \`TC-<FEATURE>-<SEQ>\` (e.g., \`TC-JC-001\`)
   - Every defect has an ID: \`BUG-<FEATURE>-<SEQ>\` (e.g., \`BUG-JC-001\`)
   - Always preserve and propagate these IDs in test annotations and defect reports.
3. **Native Test Code**:
   - Generate standard, idiomatic tests (\`pytest\`, \`playwright\`, \`k6\`).
   - Do NOT wrap test runners in non-standard scripts.
   - Decorate pytest tests with \`@pytest.mark.verispec(id="TC-...", req="REQ-...", tier="...")\`.
   - Decorate Playwright tests with \`test.info().annotations.push({ type: 'verispec_id', description: 'TC-...' })\`.
4. **Continuous Reporting**:
   - Never create a standalone report command. Test executions automatically update \`.verispec/reports/latest/results.json\`, \`report.md\`, and \`report.html\`.
5. **Quality Gates**:
   - Critical requirements require 100% coverage across Unit, API, and E2E where applicable.
   - Zero critical defects allowed for a release to be verified.

## Available VeriSpec Commands

- \`verispec rulebook\` — Define or inspect testing principles and quality gates (\`.verispec/rulebook.md\`).
- \`verispec strategy\` — Generate test strategy from \`spec.md\` or codebase analysis (\`.verispec/strategy.md\`).
- \`verispec cases\` — Generate structured test cases (functional, negative, boundary, security) in \`.verispec/cases/\`.
- \`verispec implement\` — Generate native executable tests in \`tests/\` with continuous reporter hooks.
- \`verispec run\` — Execute test suites with tier, requirement, or case filtering.
- \`verispec analyze\` — Classify failures in \`.verispec/reports/latest/results.json\` (product defect, test issue, env error) and produce diagnostic triage cards.
- \`verispec trace\` — Generate cross-cutting audit traceability matrix (\`traceability.md\` and \`traceability.html\`).
- \`verispec impact\` — Analyze Git diff against test registry to identify affected requirements and tests.
- \`verispec regression\` — Select and run targeted regression test suite.

Note: The single source of truth is always \`.verispec/\`. Do not maintain separate quality state outside \`.verispec/\`.
`;

  // Merge or write CLAUDE.md
  if (fs.existsSync(claudeMdPath)) {
    const existing = await fs.readFile(claudeMdPath, 'utf-8');
    if (!existing.includes('VeriSpec')) {
      await fs.writeFile(claudeMdPath, `${existing}\n\n${claudeMdContent}`, 'utf-8');
    }
  } else {
    await fs.writeFile(claudeMdPath, claudeMdContent, 'utf-8');
  }

  // Create Claude slash commands in .claude/commands/
  const commands = [
    {
      name: 'verispec.rulebook.md',
      content: `---
description: Create or review the project testing rulebook, supported test types, and quality gates
---
Review and enforce the testing principles and quality gates defined in .verispec/rulebook.md.
If the file does not exist, run \`verispec rulebook\` to generate it.
`,
    },
    {
      name: 'verispec.strategy.md',
      content: `---
description: Generate or inspect the VeriSpec test strategy from spec.md or codebase
---
Examine the specification in spec.md and the rules in .verispec/rulebook.md.
Run \`verispec strategy\` or analyze requirements to generate a complete test strategy in .verispec/strategy.md.
Ensure risk ratings (Critical, High, Medium, Low) and test tier mappings (Unit, API, Integration, E2E, Security) are strictly defined.
`,
    },
    {
      name: 'verispec.cases.md',
      content: `---
description: Generate structured test cases with stable IDs from approved test strategy
---
Review .verispec/strategy.md and generate test cases into .verispec/cases/:
- functional.md (Happy paths and business flows)
- negative.md (Validation, authorization, and error handling)
- boundary.md (Limits and threshold scenarios)
- security.md (Security and authorization verification)
Ensure each test case has a deterministic TC ID (e.g., TC-JC-001) linked to its requirement (REQ-JC-001).
`,
    },
    {
      name: 'verispec.implement.md',
      content: `---
description: Implement native executable tests for all defined test cases
---
Read .verispec/cases/*.md and translate them into native test code:
- Python: pytest files in tests/unit/, tests/api/, tests/integration/, tests/security/
- TypeScript: Playwright specs in tests/e2e/
Always decorate tests with VeriSpec metadata linking them to their TC and REQ IDs.
Ensure tests/conftest.py or Playwright reporter is active for continuous reporting.
`,
    },
    {
      name: 'verispec.run.md',
      content: `---
description: Execute test suites with continuous live reporting
---
Run tests using \`verispec run\` or directly via native test runners (\`pytest\`, \`npx playwright test\`).
Results are automatically streamed into .verispec/reports/latest/results.json and report.html.
`,
    },
    {
      name: 'verispec.analyze.md',
      content: `---
description: AI-assisted failure classification and diagnostic root-cause triage
---
Examine test failures in .verispec/reports/latest/results.json.
Classify root cause into Product Defect, Test Defect, Environment Issue, or Test Data Problem.
Generate diagnostic cards in .verispec/defects/ (drafting BUG-* cards only for verified product defects).
`,
    },
    {
      name: 'verispec.trace.md',
      content: `---
description: Generate cross-cutting traceability audit matrix (REQ -> TC -> Test -> Run -> Defect)
---
Run \`verispec trace\` to generate .verispec/traceability.md and .verispec/traceability.html.
Verify requirement coverage and release evidence whether tests passed or failed.
`,
    },
    {
      name: 'verispec.impact.md',
      content: `---
description: Analyze Git diff to determine affected requirements and tests
---
Run \`verispec impact\` to compare git changes (main...HEAD) against requirements and test registry.
Identify modified files, affected requirements, and tests requiring re-execution.
`,
    },
    {
      name: 'verispec.regression.md',
      content: `---
description: Select and execute targeted regression test suite
---
Run \`verispec regression\` to execute only tests affected by recent code changes plus critical safety invariants.
`,
    },
  ];

  for (const cmd of commands) {
    // Write full namespaced command e.g. verispec.strategy.md (/verispec.strategy)
    await fs.writeFile(path.join(commandsDir, cmd.name), cmd.content, 'utf-8');
  }
}

/**
 * 2. GitHub Copilot Bindings
 * Creates .github/copilot-instructions.md and prompt files
 */
async function installCopilotBindings(cwd) {
  const githubDir = path.resolve(cwd, '.github');
  const promptsDir = path.resolve(githubDir, 'prompts');
  await fs.ensureDir(promptsDir);

  const copilotInstructionsPath = path.join(githubDir, 'copilot-instructions.md');
  const copilotContent = `# GitHub Copilot Quality Engineering Instructions (VeriSpec)

This repository adheres to the **VeriSpec** Spec-Driven Quality Engineering framework.

## Operating Principles

1. **Spec-Driven**: Features are specified in \`spec.md\`. Testing strategy is in \`.verispec/strategy.md\`.
2. **Deterministic IDs**: Always use and preserve IDs:
   - Requirements: \`REQ-<FEATURE>-<SEQ>\`
   - Test Cases: \`TC-<FEATURE>-<SEQ>\`
   - Defects: \`BUG-<FEATURE>-<SEQ>\`
3. **Native Test Code**: Write native test code (\`pytest\`, \`playwright\`).
   - In pytest: decorate with \`@pytest.mark.verispec(id="TC-...", req="REQ-...", tier="...")\`
   - In Playwright: add \`test.info().annotations.push({ type: 'verispec_id', description: 'TC-...' })\`
4. **Continuous Reporting**: All test runs continuously stream results into \`.verispec/reports/latest/\`.
5. **Quality Gates**: Zero critical defects allowed. All critical requirements must have verified tests.

## Key VeriSpec Commands

- \`verispec strategy\`: Generate test strategy from specification
- \`verispec cases\`: Generate test cases with stable IDs
- \`verispec implement\`: Generate native test code with reporter hooks
- \`verispec run\`: Execute test suites
- \`verispec analyze\`: Diagnose failures and create defect cards
- \`verispec trace\`: Build traceability matrix
- \`verispec impact\`: Map git changes to affected tests
- \`verispec regression\`: Execute targeted regression suite
`;

  if (fs.existsSync(copilotInstructionsPath)) {
    const existing = await fs.readFile(copilotInstructionsPath, 'utf-8');
    if (!existing.includes('VeriSpec')) {
      await fs.writeFile(copilotInstructionsPath, `${existing}\n\n${copilotContent}`, 'utf-8');
    }
  } else {
    await fs.writeFile(copilotInstructionsPath, copilotContent, 'utf-8');
  }

  // Copilot prompt templates for all /verispec.<command> slash commands
  const copilotCommands = [
    { name: 'verispec.rulebook.prompt.md', prompt: 'Review or update the project testing policy and quality gates in .verispec/rulebook.md.' },
    { name: 'verispec.strategy.prompt.md', prompt: 'Analyze spec.md against .verispec/rulebook.md. Create a risk-based test strategy mapping requirements to test tiers in .verispec/strategy.md.' },
    { name: 'verispec.cases.prompt.md', prompt: 'Using .verispec/strategy.md, generate structured test cases with stable TC IDs in .verispec/cases/ across functional, negative, boundary, and security.' },
    { name: 'verispec.implement.prompt.md', prompt: 'Read .verispec/cases/*.md and generate native executable test scripts in tests/ with VeriSpec metadata decorators and continuous reporting.' },
    { name: 'verispec.run.prompt.md', prompt: 'Execute the project test suites. Results will continuously stream into .verispec/reports/latest/.' },
    { name: 'verispec.analyze.prompt.md', prompt: 'Examine test failures in .verispec/reports/latest/results.json and generate defect cards in .verispec/defects/BUG-*.md with root cause analysis.' },
    { name: 'verispec.trace.prompt.md', prompt: 'Generate the bidirectional requirement-to-evidence matrix in .verispec/traceability.md and .verispec/traceability.html.' },
    { name: 'verispec.impact.prompt.md', prompt: 'Analyze Git diff against requirements and test registry to identify affected tests and change risk score.' },
    { name: 'verispec.regression.prompt.md', prompt: 'Select and execute targeted regression tests based on change impact analysis.' },
  ];

  for (const cmd of copilotCommands) {
    await fs.writeFile(path.join(promptsDir, cmd.name), cmd.prompt, 'utf-8');
  }
}

/**
 * 3. Cursor Bindings
 * Creates .cursor/rules/verispec.mdc
 */
async function installCursorBindings(cwd) {
  const cursorRulesDir = path.resolve(cwd, '.cursor', 'rules');
  await fs.ensureDir(cursorRulesDir);

  const cursorMdcPath = path.join(cursorRulesDir, 'verispec.mdc');
  const cursorContent = `---
description: VeriSpec Quality Engineering Framework Rules
globs: ["spec.md", ".verispec/**/*", "tests/**/*"]
alwaysApply: true
---

# VeriSpec Quality Engineering Rules

You are acting as a Quality Engineering expert pair programmer adhering to the **VeriSpec** framework.

## Supported Chatbox Slash Commands

When the user types any of the following slash commands in the chatbox, execute the corresponding VeriSpec workflow:

- **/verispec.rulebook** or **/rulebook**: Review or enforce testing principles and quality gates in \`.verispec/rulebook.md\`.
- **/verispec.strategy** or **/strategy**: Read \`spec.md\`, analyze business and technical risks, and generate/update \`.verispec/strategy.md\`.
- **/verispec.cases** or **/cases**: Read \`.verispec/strategy.md\` and generate structured test cases with stable deterministic IDs (\`TC-<FEATURE>-<SEQ>\`) in \`.verispec/cases/\` across functional, negative, boundary, and security.
- **/verispec.implement** or **/implement**: Translate test cases into native executable test scripts (\`pytest\`, \`playwright\`) in \`tests/\` with VeriSpec metadata decorators.
- **/verispec.run** or **/run**: Execute test suites. Execution results continuously stream into \`.verispec/reports/latest/\`.
- **/verispec.analyze** or **/analyze**: Read test failures in \`.verispec/reports/latest/results.json\`, inspect source code, and create structured defect cards in \`.verispec/defects/BUG-<ID>.md\`.
- **/verispec.trace** or **/trace**: Generate bidirectional requirement-to-evidence matrix in \`.verispec/traceability.md\` and \`.verispec/traceability.html\`.
- **/verispec.impact** or **/impact**: Analyze Git diff against requirements and test registry to calculate affected tests and change risk score.
- **/verispec.regression** or **/regression**: Select and run targeted regression suite based on change impact analysis.

## Key Directives

- **Spec Ownership**: \`spec.md\` is the development source of truth. VeriSpec derives tests from it.
- **Traceability**: Always tag tests with stable IDs:
  - Python: \`@pytest.mark.verispec(id="TC-...", req="REQ-...", tier="unit|api|integration|e2e|security")\`
  - TypeScript (Playwright): \`test.info().annotations.push({ type: 'verispec_id', description: 'TC-...' })\`
- **Continuous Reporting**: Reports in \`.verispec/reports/latest/\` update automatically on test execution. Never suggest running a separate report command.
- **Defect Analysis**: If tests fail, run \`verispec analyze\` to generate \`.verispec/defects/BUG-*.md\` instead of modifying tests without analysis.
- **Targeted Regression**: When code files change, use \`verispec impact\` and \`verispec regression\` rather than blindly running full suites.
`;

  await fs.writeFile(cursorMdcPath, cursorContent, 'utf-8');

  // Also create .cursor/commands/
  const cursorCommandsDir = path.resolve(cwd, '.cursor', 'commands');
  await fs.ensureDir(cursorCommandsDir);
  for (const cmd of ['rulebook', 'strategy', 'cases', 'implement', 'run', 'analyze', 'trace', 'impact', 'regression']) {
    await fs.writeFile(path.join(cursorCommandsDir, `verispec.${cmd}.md`), `Execute VeriSpec ${cmd} workflow according to .cursor/rules/verispec.mdc`, 'utf-8');
    await fs.writeFile(path.join(cursorCommandsDir, `${cmd}.md`), `Execute VeriSpec ${cmd} workflow according to .cursor/rules/verispec.mdc`, 'utf-8');
  }
}

/**
 * 4. Google Antigravity Bindings
 * Creates .agents/rules/verispec.md and .agents/skills/verispec/SKILL.md
 */
async function installAntigravityBindings(cwd) {
  const agentsRulesDir = path.resolve(cwd, '.agents', 'rules');
  const skillDir = path.resolve(cwd, '.agents', 'skills', 'verispec');
  await fs.ensureDir(agentsRulesDir);
  await fs.ensureDir(skillDir);

  const ruleContent = `# VeriSpec Quality Engineering Workspace Rule

This repository uses the VeriSpec Quality Engineering framework.

## Lifecycle & Commands
1. \`verispec rulebook\` — Permanent testing policy and quality gates (\`.verispec/rulebook.md\`)
2. \`verispec strategy\` — Risk-based test strategy (\`.verispec/strategy.md\`)
3. \`verispec cases\` — Structured test cases with stable IDs (\`.verispec/cases/\`)
4. \`verispec implement\` — Idiomatic native test generation with continuous reporter hooks
5. \`verispec run\` — Flexible runner orchestration (by tier, case, or requirement)
6. \`verispec analyze\` — AI failure diagnosis and defect card generation
7. \`verispec trace\` — Bidirectional requirement-to-evidence matrix
8. \`verispec impact\` — Change impact analysis from Git diffs
9. \`verispec regression\` — Targeted regression test selection

## Invariant Rules
- Preserve ID chains: \`REQ-xxx\` -> \`TC-xxx\` -> \`test_xxx()\` -> \`BUG-xxx\`.
- All tests must be native, runnable independently via standard runners (\`pytest\`, \`playwright\`).
- Reports update continuously; do not attempt to run a separate report command.
`;

  await fs.writeFile(path.join(agentsRulesDir, 'verispec.md'), ruleContent, 'utf-8');

  const skillContent = `---
name: verispec
description: Spec-Driven Quality Engineering skill. Use to create test strategies, test cases, executable tests, analyze failures, and perform change impact analysis.
---

# VeriSpec Quality Engineering Skill

Use this skill when designing, implementing, executing, or analyzing tests for features specified in \`spec.md\` or for brownfield projects.

## Workflow

1. Check if \`.verispec/config.yaml\` exists. If not, initialize with \`verispec init\`.
2. Inspect or update \`.verispec/rulebook.md\` to align with project quality gates.
3. Review \`spec.md\` and run \`verispec strategy\` to allocate test tiers based on risk.
4. Run \`verispec cases\` to generate test cases with stable IDs in \`.verispec/cases/\`.
5. Run \`verispec implement\` to generate executable test scripts in \`tests/\`.
6. Run tests with \`verispec run\` or native tools (\`pytest\`, \`playwright\`).
7. Open \`.verispec/reports/latest/report.html\` to view the live dashboard.
8. If failures occur, run \`verispec analyze\` to diagnose root causes and generate defect cards.
9. When code changes, run \`verispec impact\` and \`verispec regression\` for targeted retesting.
`;

  await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent, 'utf-8');
}

/**
 * 5. Windsurf Bindings
 * Creates .windsurfrules
 */
async function installWindsurfBindings(cwd) {
  const windsurfPath = path.resolve(cwd, '.windsurfrules');
  const windsurfContent = `# VeriSpec Quality Engineering Rules (Windsurf Cascade)

- Development owns spec.md; VeriSpec translates it into test strategies and executable suites.
- Always preserve stable IDs: REQ-*, TC-*, BUG-*, RUN-*.
- Test code must remain native (pytest, playwright) with VeriSpec metadata annotations.
- Reports (.verispec/reports/latest/) are updated continuously during test runs.
- Run 'verispec analyze' on failures to diagnose root causes and produce defect cards.
- Run 'verispec impact' and 'verispec regression' on code changes for smart test selection.
`;

  if (fs.existsSync(windsurfPath)) {
    const existing = await fs.readFile(windsurfPath, 'utf-8');
    if (!existing.includes('VeriSpec')) {
      await fs.writeFile(windsurfPath, `${existing}\n\n${windsurfContent}`, 'utf-8');
    }
  } else {
    await fs.writeFile(windsurfPath, windsurfContent, 'utf-8');
  }

  // Create Windsurf Cascade Workflows in .windsurf/workflows/
  const workflowsDir = path.resolve(cwd, '.windsurf', 'workflows');
  await fs.ensureDir(workflowsDir);

  const windsurfWorkflows = [
    { name: 'verispec.rulebook.md', desc: 'Inspect or update project testing policy and quality gates (.verispec/rulebook.md)' },
    { name: 'verispec.strategy.md', desc: 'Generate test strategy from spec.md or codebase analysis (.verispec/strategy.md)' },
    { name: 'verispec.cases.md', desc: 'Generate structured test cases with stable IDs in .verispec/cases/' },
    { name: 'verispec.implement.md', desc: 'Scaffold native executable test code in tests/ with VeriSpec metadata decorators' },
    { name: 'verispec.run.md', desc: 'Execute tests with continuous live reporting into .verispec/reports/latest/' },
    { name: 'verispec.analyze.md', desc: 'Diagnose test failures from results.json and create defect cards in .verispec/defects/' },
    { name: 'verispec.trace.md', desc: 'Generate bidirectional requirement-to-evidence matrix in .verispec/traceability.md' },
    { name: 'verispec.impact.md', desc: 'Analyze Git diff against requirements to calculate affected tests and risk' },
    { name: 'verispec.regression.md', desc: 'Select and run targeted regression suite based on impact analysis' },
  ];

  for (const wf of windsurfWorkflows) {
    await fs.writeFile(
      path.join(workflowsDir, wf.name),
      `# /${wf.name.replace(/\.md$/, '')}\n\n${wf.desc}\n\nExecute the corresponding VeriSpec workflow steps according to .windsurfrules.`,
      'utf-8'
    );
  }
}
