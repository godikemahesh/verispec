import test from 'node:test';
import assert from 'node:assert';
import {
  getBannerText,
  renderStaticBanner,
  renderSuccessHero,
  playInitAnimation,
} from '../src/utils/animation.js';

test('animation utilities render banner and success hero accurately', async () => {
  // 1. Banner text contains framework name and version
  const banner = getBannerText('0.1.6');
  assert.ok(banner.includes('SPEC-DRIVEN QUALITY ENGINEERING FRAMEWORK'), 'banner should contain subtitle');
  assert.ok(banner.includes('v0.1.6'), 'banner should contain version');

  // 2. renderStaticBanner executes without error
  renderStaticBanner('0.1.6');

  // 3. renderSuccessHero executes and includes targets
  renderSuccessHero({
    version: '0.1.6',
    agents: ['claude', 'antigravity'],
  });

  // 4. playInitAnimation executes safely in non-interactive / CI / test mode
  await playInitAnimation({ version: '0.1.6', durationMs: 20 });
});
