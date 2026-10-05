/**
 * VeriSpec File Utilities
 * 
 * Handles reading, writing, and scaffolding files with template rendering.
 */

import fs from 'fs-extra';
import path from 'path';
import Mustache from 'mustache';
import { logger } from './logger.js';

/** Root directory constants */
export const VERISPEC_DIR = '.verispec';
export const TEMPLATES_DIR = path.join(VERISPEC_DIR, 'templates');
export const REPORTS_DIR = path.join(VERISPEC_DIR, 'reports');
export const LATEST_REPORT_DIR = path.join(REPORTS_DIR, 'latest');
export const DEFECTS_DIR = path.join(VERISPEC_DIR, 'defects');
export const CASES_DIR = path.join(VERISPEC_DIR, 'cases');
export const IMPACT_DIR = path.join(VERISPEC_DIR, 'impact');
export const REGRESSION_DIR = path.join(VERISPEC_DIR, 'regression');
export const STATE_DIR = path.join(VERISPEC_DIR, 'state');
export const REPORTERS_DIR = path.join(VERISPEC_DIR, 'reporters');
export const RULES_DIR = path.join(VERISPEC_DIR, 'rules');

/**
 * Resolve the .verispec directory from the current working directory
 */
export function resolveVerispecRoot(cwd = process.cwd()) {
  return path.resolve(cwd, VERISPEC_DIR);
}

/**
 * Check if VeriSpec has been initialized in the given directory
 */
export function isInitialized(cwd = process.cwd()) {
  return fs.existsSync(path.resolve(cwd, VERISPEC_DIR, 'config.yaml'));
}

/**
 * Ensure VeriSpec is initialized before running a command
 */
export function requireInit(cwd = process.cwd()) {
  if (!isInitialized(cwd)) {
    logger.error('VeriSpec is not initialized in this project.');
    logger.info('Run: verispec init');
    process.exit(1);
  }
}

/**
 * Read a template file from the package's bundled templates
 */
export function readBundledTemplate(templateName) {
  const templatePath = path.resolve(
    new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
    '..', 'templates', templateName
  );
  return fs.readFileSync(templatePath, 'utf-8');
}

/**
 * Read a template from the project's .verispec/templates/ directory
 */
export function readProjectTemplate(templateName, cwd = process.cwd()) {
  const templatePath = path.resolve(cwd, TEMPLATES_DIR, templateName);
  if (!fs.existsSync(templatePath)) {
    logger.warn(`Template not found: ${templateName}. Using bundled default.`);
    return readBundledTemplate(templateName);
  }
  return fs.readFileSync(templatePath, 'utf-8');
}

/**
 * Render a Mustache template with context data
 */
export function renderTemplate(template, context) {
  return Mustache.render(template, context);
}

/**
 * Write a file, creating parent directories as needed
 */
export async function writeFile(filePath, content, cwd = process.cwd()) {
  const fullPath = path.resolve(cwd, filePath);
  await fs.ensureDir(path.dirname(fullPath));
  await fs.writeFile(fullPath, content, 'utf-8');
  logger.success(`Created: ${filePath}`);
  return fullPath;
}

/**
 * Copy a file from source to destination
 */
export async function copyFile(src, dest, cwd = process.cwd()) {
  const fullDest = path.resolve(cwd, dest);
  await fs.ensureDir(path.dirname(fullDest));
  await fs.copy(src, fullDest);
  logger.success(`Copied: ${dest}`);
}

/**
 * Read and parse a YAML config file
 */
export async function readConfig(cwd = process.cwd()) {
  const configPath = path.resolve(cwd, VERISPEC_DIR, 'config.yaml');
  const yaml = (await import('js-yaml')).default;
  const content = await fs.readFile(configPath, 'utf-8');
  return yaml.load(content);
}

/**
 * Write a YAML config file
 */
export async function writeConfig(config, cwd = process.cwd()) {
  const configPath = path.resolve(cwd, VERISPEC_DIR, 'config.yaml');
  const yaml = (await import('js-yaml')).default;
  await fs.ensureDir(path.dirname(configPath));
  await fs.writeFile(configPath, yaml.dump(config, { lineWidth: 120 }), 'utf-8');
}

/**
 * Read the test registry (state/test-registry.json)
 */
export async function readTestRegistry(cwd = process.cwd()) {
  const registryPath = path.resolve(cwd, STATE_DIR, 'test-registry.json');
  if (!fs.existsSync(registryPath)) {
    return { tests: [], lastUpdated: null };
  }
  return fs.readJSON(registryPath);
}

/**
 * Write the test registry
 */
export async function writeTestRegistry(registry, cwd = process.cwd()) {
  const registryPath = path.resolve(cwd, STATE_DIR, 'test-registry.json');
  await fs.ensureDir(path.dirname(registryPath));
  registry.lastUpdated = new Date().toISOString();
  await fs.writeJSON(registryPath, registry, { spaces: 2 });
}

/**
 * Read the requirement map (state/requirement-map.json)
 */
export async function readRequirementMap(cwd = process.cwd()) {
  const mapPath = path.resolve(cwd, STATE_DIR, 'requirement-map.json');
  if (!fs.existsSync(mapPath)) {
    return { requirements: {}, lastUpdated: null };
  }
  return fs.readJSON(mapPath);
}

/**
 * Write the requirement map
 */
export async function writeRequirementMap(reqMap, cwd = process.cwd()) {
  const mapPath = path.resolve(cwd, STATE_DIR, 'requirement-map.json');
  await fs.ensureDir(path.dirname(mapPath));
  reqMap.lastUpdated = new Date().toISOString();
  await fs.writeJSON(mapPath, reqMap, { spaces: 2 });
}

/**
 * Read the stable requirements state (state/requirements.json)
 */
export async function readRequirements(cwd = process.cwd()) {
  const reqPath = path.resolve(cwd, STATE_DIR, 'requirements.json');
  if (!fs.existsSync(reqPath)) {
    return { requirements: {}, lastUpdated: null };
  }
  return fs.readJSON(reqPath);
}

/**
 * Write the stable requirements state (state/requirements.json)
 */
export async function writeRequirements(data, cwd = process.cwd()) {
  const reqPath = path.resolve(cwd, STATE_DIR, 'requirements.json');
  await fs.ensureDir(path.dirname(reqPath));
  data.lastUpdated = new Date().toISOString();
  await fs.writeJSON(reqPath, data, { spaces: 2 });
}

/**
 * Get timestamp string for file naming
 */
export function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Get date-based run ID
 */
export function getRunId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `RUN-${date}-${seq}`;
}
