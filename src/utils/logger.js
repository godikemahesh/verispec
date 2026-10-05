/**
 * VeriSpec Logger — Styled terminal output
 */

import chalk from 'chalk';

const PREFIX = chalk.bold.cyan('[VeriSpec]');

export const logger = {
  info: (msg) => console.log(`${PREFIX} ${msg}`),
  success: (msg) => console.log(`${PREFIX} ${chalk.green('✓')} ${msg}`),
  warn: (msg) => console.log(`${PREFIX} ${chalk.yellow('⚠')} ${msg}`),
  error: (msg) => console.error(`${PREFIX} ${chalk.red('✗')} ${msg}`),
  step: (num, total, msg) => console.log(`${PREFIX} ${chalk.dim(`[${num}/${total}]`)} ${msg}`),
  divider: () => console.log(chalk.dim('─'.repeat(60))),
  
  banner: (title) => {
    console.log('');
    console.log(chalk.bold.cyan('┌' + '─'.repeat(58) + '┐'));
    console.log(chalk.bold.cyan('│') + ' ' + chalk.bold.white(title.padEnd(57)) + chalk.bold.cyan('│'));
    console.log(chalk.bold.cyan('└' + '─'.repeat(58) + '┘'));
    console.log('');
  },

  table: (headers, rows) => {
    const widths = headers.map((h, i) => 
      Math.max(h.length, ...rows.map(r => String(r[i] || '').length))
    );
    
    const sep = '┼' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┼';
    const headerLine = '│' + headers.map((h, i) => ` ${chalk.bold(h.padEnd(widths[i]))} `).join('│') + '│';
    
    console.log(sep);
    console.log(headerLine);
    console.log(sep);
    rows.forEach(row => {
      const line = '│' + row.map((cell, i) => ` ${String(cell || '').padEnd(widths[i])} `).join('│') + '│';
      console.log(line);
    });
    console.log(sep);
  },

  result: (label, value, status) => {
    const icon = status === 'pass' ? chalk.green('█') : 
                 status === 'fail' ? chalk.red('█') : 
                 chalk.yellow('░');
    console.log(`  ${icon} ${chalk.bold(label.padEnd(20))} ${value}`);
  }
};
