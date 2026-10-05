/**
 * VeriSpec Git Utilities
 * 
 * Git diff analysis, change detection, and commit tracking
 * for impact analysis and regression selection.
 */

import simpleGit from 'simple-git';
import path from 'path';
import { logger } from './logger.js';

/**
 * Get a simple-git instance for the working directory
 */
export function getGit(cwd = process.cwd()) {
  return simpleGit(cwd);
}

/**
 * Check if the directory is a git repository
 */
export async function isGitRepo(cwd = process.cwd()) {
  try {
    const git = getGit(cwd);
    await git.revparse(['--git-dir']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get diff between two refs (file-level summary)
 */
export async function getDiffSummary(base = 'main', head = 'HEAD', cwd = process.cwd()) {
  try {
    const git = getGit(cwd);
    const diff = await git.diffSummary([`${base}...${head}`]);
    return {
      files: diff.files.map(f => ({
        file: f.file,
        changes: f.changes,
        insertions: f.insertions,
        deletions: f.deletions,
        binary: f.binary,
      })),
      insertions: diff.insertions,
      deletions: diff.deletions,
      filesChanged: diff.changed,
    };
  } catch (err) {
    logger.warn(`Git diff failed: ${err.message}`);
    return { files: [], insertions: 0, deletions: 0, filesChanged: 0 };
  }
}

/**
 * Get detailed diff with line-level changes
 */
export async function getDetailedDiff(base = 'main', head = 'HEAD', cwd = process.cwd()) {
  try {
    const git = getGit(cwd);
    const diff = await git.diff([`${base}...${head}`, '--unified=3']);
    return diff;
  } catch (err) {
    logger.warn(`Detailed diff failed: ${err.message}`);
    return '';
  }
}

/**
 * Get list of changed files (paths only)
 */
export async function getChangedFiles(base = 'main', head = 'HEAD', cwd = process.cwd()) {
  try {
    const git = getGit(cwd);
    const result = await git.diff([`${base}...${head}`, '--name-only']);
    return result.trim().split('\n').filter(f => f.length > 0);
  } catch (err) {
    // Fall back to status if no base ref
    try {
      const git = getGit(cwd);
      const status = await git.status();
      return [...status.modified, ...status.created, ...status.renamed.map(r => r.to)];
    } catch {
      return [];
    }
  }
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(cwd = process.cwd()) {
  try {
    const git = getGit(cwd);
    const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
    return branch.trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get latest commit hash (short)
 */
export async function getLatestCommit(cwd = process.cwd()) {
  try {
    const git = getGit(cwd);
    const hash = await git.revparse(['--short', 'HEAD']);
    return hash.trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get recent log entries
 */
export async function getRecentLog(count = 10, cwd = process.cwd()) {
  try {
    const git = getGit(cwd);
    const log = await git.log({ maxCount: count });
    return log.all.map(entry => ({
      hash: entry.hash.substring(0, 7),
      message: entry.message,
      author: entry.author_name,
      date: entry.date,
    }));
  } catch {
    return [];
  }
}
