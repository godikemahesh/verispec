import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.resolve(__dirname, '..', 'bin', 'verispec.js');

function runCli(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd,
      env: { ...process.env, CI: '1' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', reject);
  });
}

test('End-to-End VeriSpec Lifecycle: init -> rulebook -> strategy -> cases -> implement -> trace', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verispec-e2e-'));

  try {
    // 0. Setup a sample specification file (spec.md)
    const sampleSpec = `# Test Specification: Job Card Creation

## Objective
Verify that authorized service advisors can create valid job cards.

## Requirements

### REQ-JC-001: Valid Job Card Creation
A valid customer and vehicle must create a job card with status OPEN.
Risk: High

### REQ-JC-002: Customer Validation
Customer identifier is mandatory for all job card creation requests.
Risk: Medium

### REQ-JC-003: Vehicle Validation
Vehicle identifier is mandatory for all job card creation requests.
Risk: Medium

### REQ-JC-004: Authorization Enforcement
Only users with role SERVICE_ADVISOR can create job cards.
Risk: Critical

### REQ-JC-005: Duplicate Submission Prevention
Duplicate submissions within 30 seconds must not create duplicate job cards.
Risk: High
`;
    await fs.writeFile(path.join(tmpDir, 'spec.md'), sampleSpec, 'utf-8');

    // 1. verispec init
    const initRes = await runCli(['init', '--agent', 'all'], tmpDir);
    assert.strictEqual(initRes.code, 0, `init should exit 0: ${initRes.stderr}`);
    assert.ok(fs.existsSync(path.join(tmpDir, '.verispec', 'config.yaml')), 'config.yaml should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, '.verispec', 'rulebook.md')), 'rulebook.md should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, '.verispec', 'reports', 'latest', 'results.json')), 'results.json should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, '.verispec', 'reports', 'latest', 'report.html')), 'report.html should exist');
    const reportHtmlContent = await fs.readFile(path.join(tmpDir, '.verispec', 'reports', 'latest', 'report.html'), 'utf-8');
    assert.ok(reportHtmlContent.includes('window.__VERISPEC_DATA__'), 'report.html should have embedded data to bypass CORS on file://');
    assert.ok(fs.existsSync(path.join(tmpDir, '.verispec', 'reports', 'latest', 'report.md')), 'report.md should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, 'tests', 'conftest.py')), 'tests/conftest.py should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, 'CLAUDE.md')), 'CLAUDE.md should exist');

    // 2. verispec rulebook
    const rulebookRes = await runCli(['rulebook'], tmpDir);
    assert.strictEqual(rulebookRes.code, 0, `rulebook should exit 0: ${rulebookRes.stderr}`);
    assert.ok(rulebookRes.stdout.includes('Core Principles'), 'rulebook output should show principles');

    // 3. verispec strategy
    const strategyRes = await runCli(['strategy'], tmpDir);
    assert.strictEqual(strategyRes.code, 0, `strategy should exit 0: ${strategyRes.stderr}`);
    assert.ok(fs.existsSync(path.join(tmpDir, '.verispec', 'strategy.md')), 'strategy.md should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, '.verispec', 'state', 'requirements.json')), 'requirements.json should exist');
    const strategyContent = await fs.readFile(path.join(tmpDir, '.verispec', 'strategy.md'), 'utf-8');
    assert.ok(strategyContent.includes('REQ-JC-001'), 'strategy should contain REQ-JC-001');

    // 4. verispec cases
    const casesRes = await runCli(['cases'], tmpDir);
    assert.strictEqual(casesRes.code, 0, `cases should exit 0: ${casesRes.stderr}`);
    assert.ok(fs.existsSync(path.join(tmpDir, '.verispec', 'cases', 'functional.md')), 'functional.md should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, '.verispec', 'cases', 'negative.md')), 'negative.md should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, '.verispec', 'cases', 'boundary.md')), 'boundary.md should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, '.verispec', 'cases', 'security.md')), 'security.md should exist');

    // 5. verispec implement
    const implementRes = await runCli(['implement'], tmpDir);
    assert.strictEqual(implementRes.code, 0, `implement should exit 0: ${implementRes.stderr}`);
    assert.ok(fs.existsSync(path.join(tmpDir, 'tests', 'api')), 'tests/api/ should exist');

    // 6. verispec trace
    const traceRes = await runCli(['trace'], tmpDir);
    assert.strictEqual(traceRes.code, 0, `trace should exit 0: ${traceRes.stderr}`);
    assert.ok(fs.existsSync(path.join(tmpDir, '.verispec', 'traceability.md')), 'traceability.md should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, '.verispec', 'traceability.html')), 'traceability.html should exist');

    // 7. verispec analyze (when results exist)
    const analyzeRes = await runCli(['analyze'], tmpDir);
    assert.strictEqual(analyzeRes.code, 0, `analyze should exit 0: ${analyzeRes.stderr}`);

    // 8. verispec impact
    const impactRes = await runCli(['impact'], tmpDir);
    assert.strictEqual(impactRes.code, 0, `impact should exit 0: ${impactRes.stderr}`);
    assert.ok(fs.existsSync(path.join(tmpDir, '.verispec', 'state', 'latest-impact.json')), 'latest-impact.json should exist');

    // 9. verispec regression --plan
    const regRes = await runCli(['regression', '--plan'], tmpDir);
    assert.strictEqual(regRes.code, 0, `regression --plan should exit 0: ${regRes.stderr}`);
    assert.ok(regRes.stdout.includes('Targeted Regression Selection'), 'regression output should show selection');
  } finally {
    await fs.remove(tmpDir);
  }
});
