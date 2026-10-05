/**
 * VeriSpec Project Stack Detector
 * 
 * Auto-detects the project's language, frameworks, test runners,
 * and existing test infrastructure.
 */

import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { logger } from './logger.js';

/**
 * Detect the full project stack
 */
export async function detectStack(cwd = process.cwd()) {
  const stack = {
    language: null,
    languages: [],
    frameworks: [],
    testRunners: {},
    hasExistingTests: false,
    existingTestDirs: [],
    packageManager: null,
    ciPlatform: null,
    specFile: null,
  };

  // ─── Language Detection ───
  const pyFiles = await glob('**/*.py', { cwd, ignore: ['node_modules/**', '.venv/**', '__pycache__/**', '.verispec/**'], maxDepth: 4 });
  const tsFiles = await glob('**/*.{ts,tsx}', { cwd, ignore: ['node_modules/**', '.verispec/**'], maxDepth: 4 });
  const jsFiles = await glob('**/*.{js,jsx}', { cwd, ignore: ['node_modules/**', '.verispec/**'], maxDepth: 4 });
  const goFiles = await glob('**/*.go', { cwd, ignore: ['vendor/**', '.verispec/**'], maxDepth: 4 });
  const javaFiles = await glob('**/*.java', { cwd, ignore: ['target/**', '.verispec/**'], maxDepth: 4 });

  if (pyFiles.length > 0) stack.languages.push('python');
  if (tsFiles.length > 0) stack.languages.push('typescript');
  if (jsFiles.length > 0 && tsFiles.length === 0) stack.languages.push('javascript');
  if (goFiles.length > 0) stack.languages.push('go');
  if (javaFiles.length > 0) stack.languages.push('java');

  stack.language = stack.languages[0] || 'python';

  // ─── Framework Detection ───
  const pkgJsonPath = path.join(cwd, 'package.json');
  const pyprojectPath = path.join(cwd, 'pyproject.toml');
  const requirementsPath = path.join(cwd, 'requirements.txt');
  const goModPath = path.join(cwd, 'go.mod');

  if (fs.existsSync(pkgJsonPath)) {
    const pkg = await fs.readJSON(pkgJsonPath);
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    stack.packageManager = fs.existsSync(path.join(cwd, 'yarn.lock')) ? 'yarn' :
                           fs.existsSync(path.join(cwd, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm';

    if (allDeps['next']) stack.frameworks.push('nextjs');
    if (allDeps['react']) stack.frameworks.push('react');
    if (allDeps['vue']) stack.frameworks.push('vue');
    if (allDeps['express']) stack.frameworks.push('express');
    if (allDeps['fastify']) stack.frameworks.push('fastify');
    if (allDeps['nestjs'] || allDeps['@nestjs/core']) stack.frameworks.push('nestjs');

    // Test runner detection
    if (allDeps['playwright'] || allDeps['@playwright/test']) {
      stack.testRunners.e2e = { framework: 'playwright', command: 'npx playwright test' };
    }
    if (allDeps['cypress']) {
      stack.testRunners.e2e = stack.testRunners.e2e || { framework: 'cypress', command: 'npx cypress run' };
    }
    if (allDeps['vitest']) {
      stack.testRunners.unit = { framework: 'vitest', command: 'npx vitest run' };
    }
    if (allDeps['jest']) {
      stack.testRunners.unit = stack.testRunners.unit || { framework: 'jest', command: 'npx jest' };
    }
    if (allDeps['supertest']) {
      stack.testRunners.api = { framework: 'supertest', command: 'npx jest --testPathPattern=api' };
    }
  }

  if (fs.existsSync(pyprojectPath) || fs.existsSync(requirementsPath)) {
    const content = fs.existsSync(pyprojectPath) ? await fs.readFile(pyprojectPath, 'utf-8') : '';
    const reqContent = fs.existsSync(requirementsPath) ? await fs.readFile(requirementsPath, 'utf-8') : '';
    const combined = content + reqContent;

    if (combined.includes('fastapi') || combined.includes('FastAPI')) stack.frameworks.push('fastapi');
    if (combined.includes('django') || combined.includes('Django')) stack.frameworks.push('django');
    if (combined.includes('flask') || combined.includes('Flask')) stack.frameworks.push('flask');

    if (combined.includes('pytest')) {
      stack.testRunners.unit = { framework: 'pytest', command: 'pytest tests/unit -v --tb=short' };
      stack.testRunners.api = { framework: 'pytest', command: 'pytest tests/api -v --tb=short' };
      stack.testRunners.integration = { framework: 'pytest', command: 'pytest tests/integration -v --tb=short' };
      stack.testRunners.security = { framework: 'pytest', command: 'pytest tests/security -v --tb=short' };
    }
  }

  if (fs.existsSync(goModPath)) {
    stack.testRunners.unit = { framework: 'go-test', command: 'go test ./...' };
  }

  // ─── Existing Test Detection ───
  const testDirs = ['tests', 'test', '__tests__', 'spec', 'e2e', 'integration'];
  for (const dir of testDirs) {
    if (fs.existsSync(path.join(cwd, dir))) {
      stack.hasExistingTests = true;
      stack.existingTestDirs.push(dir);
    }
  }

  // ─── K6 / Performance ───
  const k6Files = await glob('**/*.k6.{js,ts}', { cwd, ignore: ['node_modules/**'], maxDepth: 3 });
  const loadFiles = await glob('**/load*.{js,ts}', { cwd: path.join(cwd, 'tests'), ignore: ['node_modules/**'], maxDepth: 2 }).catch(() => []);
  if (k6Files.length > 0 || loadFiles.length > 0) {
    stack.testRunners.performance = { framework: 'k6', command: 'k6 run' };
  }

  // ─── CI Detection ───
  if (fs.existsSync(path.join(cwd, '.github', 'workflows'))) stack.ciPlatform = 'github-actions';
  else if (fs.existsSync(path.join(cwd, '.gitlab-ci.yml'))) stack.ciPlatform = 'gitlab-ci';
  else if (fs.existsSync(path.join(cwd, 'Jenkinsfile'))) stack.ciPlatform = 'jenkins';
  else if (fs.existsSync(path.join(cwd, '.circleci'))) stack.ciPlatform = 'circleci';
  else if (fs.existsSync(path.join(cwd, 'azure-pipelines.yml'))) stack.ciPlatform = 'azure-devops';

  // ─── Spec file detection ───
  for (const specName of ['spec.md', 'SPEC.md', 'specification.md', 'requirements.md', 'PRD.md']) {
    if (fs.existsSync(path.join(cwd, specName))) {
      stack.specFile = specName;
      break;
    }
  }

  // ─── Fill defaults for common stacks ───
  if (stack.languages.includes('python') && !stack.testRunners.unit) {
    stack.testRunners.unit = { framework: 'pytest', command: 'pytest tests/unit -v --tb=short' };
    stack.testRunners.api = { framework: 'pytest', command: 'pytest tests/api -v --tb=short' };
    stack.testRunners.integration = { framework: 'pytest', command: 'pytest tests/integration -v --tb=short' };
  }

  if (stack.languages.includes('typescript') && !stack.testRunners.unit) {
    stack.testRunners.unit = { framework: 'vitest', command: 'npx vitest run' };
  }

  return stack;
}

/**
 * Convert detected stack to config.yaml runner entries
 */
export function stackToRunnerConfig(stack) {
  const runners = {};

  for (const [tier, runner] of Object.entries(stack.testRunners)) {
    runners[tier] = {
      command: runner.command,
      framework: runner.framework,
      enabled: true,
    };
  }

  // Ensure all standard tiers exist
  const defaultTiers = ['unit', 'api', 'integration', 'e2e', 'security', 'performance'];
  for (const tier of defaultTiers) {
    if (!runners[tier]) {
      runners[tier] = {
        command: '',
        framework: 'not-configured',
        enabled: false,
      };
    }
  }

  return runners;
}
