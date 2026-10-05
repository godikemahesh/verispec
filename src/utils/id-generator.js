/**
 * VeriSpec ID Generator
 * 
 * Generates stable, deterministic IDs for requirements, test cases,
 * defects, and runs. IDs are human-readable and traceable.
 * 
 * Format examples:
 *   REQ-JC-001    (Requirement)
 *   TC-JC-001     (Test Case)
 *   BUG-JC-001    (Defect)
 *   RUN-20261005-001 (Execution Run)
 */

import fs from 'fs-extra';
import path from 'path';
import { STATE_DIR } from './file-utils.js';

/**
 * ID counter state file
 */
const COUNTER_FILE = 'id-counters.json';

/**
 * Load or initialize ID counters
 */
async function loadCounters(cwd = process.cwd()) {
  const counterPath = path.resolve(cwd, STATE_DIR, COUNTER_FILE);
  if (fs.existsSync(counterPath)) {
    return fs.readJSON(counterPath);
  }
  return {
    requirements: {},
    testCases: {},
    defects: {},
    runs: 0,
  };
}

/**
 * Save ID counters
 */
async function saveCounters(counters, cwd = process.cwd()) {
  const counterPath = path.resolve(cwd, STATE_DIR, COUNTER_FILE);
  await fs.ensureDir(path.dirname(counterPath));
  await fs.writeJSON(counterPath, counters, { spaces: 2 });
}

/**
 * Generate a feature prefix from a feature name
 * e.g., "job-card-creation" → "JC"
 *       "user-authentication" → "UA"
 *       "payment-processing" → "PP"
 */
export function featurePrefix(featureName) {
  if (!featureName) return 'GN';
  
  const words = featureName
    .replace(/[^a-zA-Z\s-_]/g, '')
    .split(/[\s\-_]+/)
    .filter(w => w.length > 0);

  if (words.length === 0) return 'GN';
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  
  return words
    .slice(0, 3)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

/**
 * Generate requirement IDs
 */
export async function generateReqId(feature, cwd = process.cwd()) {
  const counters = await loadCounters(cwd);
  const prefix = featurePrefix(feature);
  
  if (!counters.requirements[prefix]) {
    counters.requirements[prefix] = 0;
  }
  counters.requirements[prefix]++;
  
  await saveCounters(counters, cwd);
  return `REQ-${prefix}-${String(counters.requirements[prefix]).padStart(3, '0')}`;
}

/**
 * Generate test case IDs
 */
export async function generateTestCaseId(feature, cwd = process.cwd()) {
  const counters = await loadCounters(cwd);
  const prefix = featurePrefix(feature);
  
  if (!counters.testCases[prefix]) {
    counters.testCases[prefix] = 0;
  }
  counters.testCases[prefix]++;
  
  await saveCounters(counters, cwd);
  return `TC-${prefix}-${String(counters.testCases[prefix]).padStart(3, '0')}`;
}

/**
 * Generate defect IDs
 */
export async function generateDefectId(feature, cwd = process.cwd()) {
  const counters = await loadCounters(cwd);
  const prefix = featurePrefix(feature);
  
  if (!counters.defects[prefix]) {
    counters.defects[prefix] = 0;
  }
  counters.defects[prefix]++;
  
  await saveCounters(counters, cwd);
  return `BUG-${prefix}-${String(counters.defects[prefix]).padStart(3, '0')}`;
}

/**
 * Generate run IDs
 */
export async function generateRunId(cwd = process.cwd()) {
  const counters = await loadCounters(cwd);
  counters.runs++;
  
  await saveCounters(counters, cwd);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `RUN-${date}-${String(counters.runs).padStart(3, '0')}`;
}

/**
 * Parse an ID to extract its components
 */
export function parseId(id) {
  const match = id.match(/^(REQ|TC|BUG|RUN)-([A-Z]+)-(\d+)$/);
  if (!match) {
    const runMatch = id.match(/^RUN-(\d{8})-(\d+)$/);
    if (runMatch) {
      return { type: 'RUN', date: runMatch[1], sequence: parseInt(runMatch[2]) };
    }
    return null;
  }
  return {
    type: match[1],
    feature: match[2],
    sequence: parseInt(match[3]),
  };
}

/**
 * Batch generate multiple test case IDs
 */
export async function generateBatchTestCaseIds(feature, count, cwd = process.cwd()) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    ids.push(await generateTestCaseId(feature, cwd));
  }
  return ids;
}
