#!/usr/bin/env node

/**
 * VeriSpec CLI Entry Point
 * Spec-Driven Quality Engineering Framework
 * 
 * Usage:
 *   npx verispec init
 *   verispec rulebook
 *   verispec strategy
 *   verispec cases
 *   verispec implement
 *   verispec run
 *   verispec analyze
 *   verispec trace
 *   verispec impact
 *   verispec regression
 */

import { createCli } from '../src/cli.js';

const cli = createCli();
cli.parse(process.argv);
