import test from 'node:test';
import assert from 'node:assert';
import { detectStack, stackToRunnerConfig } from '../src/utils/detector.js';

test('detectStack identifies project structure', async () => {
  const stack = await detectStack(process.cwd());
  assert.ok(stack, 'Stack object should be returned');
  assert.ok(Array.isArray(stack.languages), 'languages should be an array');
  assert.ok(stack.languages.includes('javascript') || stack.languages.includes('typescript'), 'Should detect JS or TS');
});

test('stackToRunnerConfig maps test runners correctly', () => {
  const mockStack = {
    testRunners: {
      unit: { framework: 'pytest', command: 'pytest tests/unit' },
      api: { framework: 'pytest', command: 'pytest tests/api' },
    },
  };

  const runners = stackToRunnerConfig(mockStack);
  assert.strictEqual(runners.unit.framework, 'pytest');
  assert.strictEqual(runners.unit.enabled, true);
  assert.strictEqual(runners.e2e.enabled, false);
});
