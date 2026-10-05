import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { renderTemplate, getTimestamp, getRunId, readRequirements, writeRequirements } from '../src/utils/file-utils.js';

test('renderTemplate interpolates variables accurately', () => {
  const template = 'Feature: {{feature}}, Count: {{count}}';
  const rendered = renderTemplate(template, { feature: 'JobCard', count: 5 });
  assert.strictEqual(rendered, 'Feature: JobCard, Count: 5');
});

test('getTimestamp returns ISO-like timestamp safe for filenames', () => {
  const ts = getTimestamp();
  assert.match(ts, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
});

test('getRunId returns valid RUN-YYYYMMDD-SEQ format', () => {
  const runId = getRunId();
  assert.match(runId, /^RUN-\d{8}-\d{3}$/);
});

test('writeRequirements and readRequirements manage state/requirements.json accurately', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verispec-reqs-test-'));
  try {
    const data = {
      feature: 'Auth',
      requirements: {
        'REQ-AUTH-001': { id: 'REQ-AUTH-001', title: 'Login', hash: 'abc123' },
      },
    };
    await writeRequirements(data, tmpDir);
    const read = await readRequirements(tmpDir);
    assert.strictEqual(read.feature, 'Auth');
    assert.strictEqual(read.requirements['REQ-AUTH-001'].hash, 'abc123');
  } finally {
    await fs.remove(tmpDir);
  }
});
