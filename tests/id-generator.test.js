import test from 'node:test';
import assert from 'node:assert';
import { featurePrefix, parseId } from '../src/utils/id-generator.js';

test('featurePrefix extracts consistent prefixes', () => {
  assert.strictEqual(featurePrefix('job-card-creation'), 'JCC');
  assert.strictEqual(featurePrefix('create-job-card'), 'CJC');
  assert.strictEqual(featurePrefix('billing'), 'BI');
  assert.strictEqual(featurePrefix('user_authentication_flow'), 'UAF');
  assert.strictEqual(featurePrefix(''), 'GN');
});

test('parseId parses requirement and test case IDs', () => {
  const req = parseId('REQ-JC-001');
  assert.deepStrictEqual(req, { type: 'REQ', feature: 'JC', sequence: 1 });

  const tc = parseId('TC-JC-042');
  assert.deepStrictEqual(tc, { type: 'TC', feature: 'JC', sequence: 42 });

  const bug = parseId('BUG-AUTH-005');
  assert.deepStrictEqual(bug, { type: 'BUG', feature: 'AUTH', sequence: 5 });

  const run = parseId('RUN-20261005-001');
  assert.strictEqual(run.type, 'RUN');
  assert.strictEqual(run.sequence, 1);
});
