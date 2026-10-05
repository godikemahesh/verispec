import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { installAgentBindings } from '../src/agents/agent-installer.js';

test('installAgentBindings creates files for all agents in temporary folder', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verispec-agent-test-'));

  try {
    const installed = await installAgentBindings('all', tmpDir);
    assert.ok(installed.length >= 5, 'Should install 5 agents');

    // Check Claude
    assert.ok(fs.existsSync(path.join(tmpDir, 'CLAUDE.md')), 'CLAUDE.md should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'commands', 'verispec.strategy.md')), 'Claude slash commands should exist');

    // Check Copilot
    assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'copilot-instructions.md')), 'copilot-instructions.md should exist');

    // Check Cursor
    assert.ok(fs.existsSync(path.join(tmpDir, '.cursor', 'rules', 'verispec.mdc')), 'verispec.mdc should exist');

    // Check Antigravity
    assert.ok(fs.existsSync(path.join(tmpDir, '.agents', 'rules', 'verispec.md')), 'Antigravity rule should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'verispec', 'SKILL.md')), 'Antigravity master skill should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'verispec-strategy', 'SKILL.md')), 'Antigravity strategy skill should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'verispec-cases', 'SKILL.md')), 'Antigravity cases skill should exist');

    // Check Windsurf
    assert.ok(fs.existsSync(path.join(tmpDir, '.windsurfrules')), '.windsurfrules should exist');
  } finally {
    await fs.remove(tmpDir);
  }
});
