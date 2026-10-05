/**
 * VeriSpec Terminal Animation & Visual Effects
 * 
 * Provides high-impact, smooth cyber-aesthetic terminal animations
 * for CLI bootstrap, installation, and success summaries.
 */

import chalk from 'chalk';

const LOGO_LINES = [
  ' ██╗   ██╗███████╗██████╗ ██╗███████╗██████╗ ███████╗ ██████╗',
  ' ██║   ██║██╔════╝██╔══██╗██║██╔════╝██╔══██╗██╔════╝██╔════╝',
  ' ██║   ██║█████╗  ██████╔╝██║███████╗██████╔╝█████╗  ██║     ',
  ' ╚██╗ ██╔╝██╔══╝  ██╔══██╗██║╚════██║██╔═══╝ ██╔══╝  ██║     ',
  '  ╚████╔╝ ███████╗██║  ██║██║███████║██║     ███████╗╚██████╗',
  '   ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚═╝     ╚══════╝ ╚═════╝',
];

// VeriSpec Brand Palette: Cyan -> Electric Blue -> Purple -> Magenta -> Cyan
const GRADIENT_STOPS = [
  [6, 214, 160],   // Neon Cyan #06d6a0
  [76, 201, 240],  // Electric Blue #4cc9f0
  [123, 104, 238], // Royal Purple #7b68ee
  [255, 77, 141],  // Neon Pink #ff4d8d
  [6, 214, 160],   // Loop to Cyan
];

/**
 * Interpolate RGB color along multi-stop gradient
 */
function getGradientRgb(t) {
  const norm = ((t % 1) + 1) % 1; // [0, 1)
  const segments = GRADIENT_STOPS.length - 1;
  const idx = Math.min(Math.floor(norm * segments), segments - 1);
  const factor = (norm * segments) - idx;
  const c1 = GRADIENT_STOPS[idx];
  const c2 = GRADIENT_STOPS[idx + 1];

  const r = Math.round(c1[0] + factor * (c2[0] - c1[0]));
  const g = Math.round(c1[1] + factor * (c2[1] - c1[1]));
  const b = Math.round(c1[2] + factor * (c2[2] - c1[2]));
  return [r, g, b];
}

/**
 * Colorize a single line with an animated wave offset
 */
function colorizeWaveLine(line, offset, maxLen = 62) {
  let result = '';
  for (let col = 0; col < line.length; col++) {
    const char = line[col];
    if (char === ' ') {
      result += ' ';
      continue;
    }
    const t = (col / maxLen) + offset;
    const [r, g, b] = getGradientRgb(t);
    result += chalk.rgb(r, g, b)(char);
  }
  return result;
}

/**
 * Generate static banner string with gradient
 */
export function getBannerText(version = '0.1.6') {
  let out = '\n';
  LOGO_LINES.forEach((line, i) => {
    out += ' ' + colorizeWaveLine(line, i * 0.08) + '\n';
  });
  out += '\n';
  out += chalk.bold.hex('#4cc9f0')('  ◈') + ' ' + 
         chalk.bold.hex('#06d6a0')('SPEC-DRIVEN QUALITY ENGINEERING FRAMEWORK') + ' ' + 
         chalk.bold.hex('#4cc9f0')('◈') + ' ' + 
         chalk.dim(`v${version}`) + '\n';
  out += chalk.dim('  Zero Untested Surface • 100% Traceability • Release Evidence\n');
  return out;
}

/**
 * Render the static styled logo banner
 */
export function renderStaticBanner(version = '0.1.6') {
  process.stdout.write(getBannerText(version));
}

/**
 * Play an interactive terminal wave animation during initialization
 */
export async function playInitAnimation({ version = '0.1.6', durationMs = 900 } = {}) {
  const isInteractive = Boolean(process.stdout.isTTY) && 
                        !process.env.CI && 
                        process.env.NODE_ENV !== 'test';

  if (!isInteractive) {
    renderStaticBanner(version);
    return;
  }

  // Animation frame settings
  const fps = 20;
  const frameDelay = 1000 / fps;
  const totalFrames = Math.round(durationMs / frameDelay);
  const totalLinesToClear = LOGO_LINES.length + 4;

  // Hide cursor during animation
  process.stdout.write('\x1b[?25l');

  const frames = [
    '⚡ Initializing VeriSpec Core Engine...',
    '◈ Calibrating Spec Matrix & Contracts...',
    '✦ Synchronizing Quality Gates & Boundaries...',
    '🛡️ Arming Continuous Verification Shields...',
  ];

  try {
    console.log('');
    for (let frame = 0; frame < totalFrames; frame++) {
      const offset = (frame / totalFrames) * 1.5;
      const scanStatus = frames[Math.min(Math.floor((frame / totalFrames) * frames.length), frames.length - 1)];

      let frameBuffer = '';
      LOGO_LINES.forEach((line) => {
        frameBuffer += ' ' + colorizeWaveLine(line, offset) + '\n';
      });

      // Progress bar beam
      const beamWidth = 40;
      const beamPos = Math.round((frame / totalFrames) * beamWidth);
      const beamLeft = '━'.repeat(beamPos);
      const beamRight = '─'.repeat(Math.max(0, beamWidth - beamPos));
      const beam = chalk.hex('#06d6a0')(beamLeft) + chalk.bold.white('◈') + chalk.dim(beamRight);

      frameBuffer += '\n';
      frameBuffer += `  ${chalk.hex('#4cc9f0')('SCAN')} [${beam}] ${chalk.hex('#7b68ee')(scanStatus)}\n`;
      frameBuffer += chalk.dim(`  VeriSpec Quality Engineering • v${version}\n`);

      // Write frame
      process.stdout.write(frameBuffer);

      // Sleep
      await new Promise(resolve => setTimeout(resolve, frameDelay));

      // Clear frame if not the last frame
      if (frame < totalFrames - 1) {
        process.stdout.write(`\x1b[${totalLinesToClear}A\x1b[0J`);
      }
    }

    // Final clean clear and static lock-in
    process.stdout.write(`\x1b[${totalLinesToClear}A\x1b[0J`);
    renderStaticBanner(version);

  } finally {
    // Restore cursor
    process.stdout.write('\x1b[?25h');
  }
}

/**
 * Display a futuristic hero completion card
 */
export function renderSuccessHero({ version = '0.1.6', agents = ['all'] } = {}) {
  const INNER_WIDTH = 72;
  const line = '═'.repeat(INNER_WIDTH);
  const agentList = Array.isArray(agents) ? agents.join(', ') : agents;
  const border = chalk.bold.hex('#06d6a0');

  console.log('');
  console.log(border(`╔${line}╗`));
  
  const title = '  ◈ VERISPEC INITIALIZATION COMPLETE ◈';
  console.log(border('║') + chalk.bold.hex('#06d6a0')(title.padEnd(INNER_WIDTH)) + border('║'));
  
  const subtitle = '  Quality Engineering Matrix Armed & Continuous Reporting Active';
  console.log(border('║') + chalk.dim(subtitle.padEnd(INNER_WIDTH)) + border('║'));
  
  console.log(border(`╠${line}╣`));
  
  const items = [
    ['Workspace Matrix', '.verispec/ (rules, templates, state, reports)'],
    ['AI Agent Bindings', agentList],
    ['Rulebook Policy', '.verispec/rulebook.md'],
    ['Dashboard (HTML)', '.verispec/reports/latest/report.html'],
    ['Executive Summary', '.verispec/reports/latest/report.md'],
    ['Live Execution Data', '.verispec/reports/latest/results.json'],
  ];

  items.forEach(([label, value]) => {
    const rawLabel = `  ${label}:`;
    const labelPadded = rawLabel.padEnd(24);
    const spaceForVal = INNER_WIDTH - labelPadded.length;
    const valDisplay = value.length > spaceForVal ? value.slice(0, spaceForVal - 3) + '...' : value.padEnd(spaceForVal);
    
    console.log(
      border('║') + 
      chalk.bold.hex('#4cc9f0')(labelPadded) + 
      chalk.white(valDisplay) + 
      border('║')
    );
  });

  console.log(border(`╚${line}╝`));
  console.log('');
  console.log(chalk.bold.white('⚡ VeriSpec Spec-Driven Quality Engineering Lifecycle:'));
  console.log(`  ${chalk.bold.hex('#06d6a0')('1.')} Define Testing Policy:   ${chalk.cyan('/verispec-rulebook')}  ${chalk.dim('or')} ${chalk.dim('npx verispec rulebook')}`);
  console.log(`  ${chalk.bold.hex('#06d6a0')('2.')} Generate Test Strategy: ${chalk.cyan('/verispec-strategy')}  ${chalk.dim('or')} ${chalk.dim('npx verispec strategy')}`);
  console.log(`  ${chalk.bold.hex('#06d6a0')('3.')} Generate Test Cases:    ${chalk.cyan('/verispec-cases')}     ${chalk.dim('or')} ${chalk.dim('npx verispec cases')}`);
  console.log(`  ${chalk.bold.hex('#06d6a0')('4.')} Implement Native Code:  ${chalk.cyan('/verispec-implement')} ${chalk.dim('or')} ${chalk.dim('npx verispec implement')}`);
  console.log(`  ${chalk.bold.hex('#06d6a0')('5.')} Run & Stream Reports:   ${chalk.cyan('/verispec-run')}       ${chalk.dim('or')} ${chalk.dim('npx verispec run')}`);
  console.log('');
}
