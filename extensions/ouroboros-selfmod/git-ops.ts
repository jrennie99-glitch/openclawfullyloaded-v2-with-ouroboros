/**
 * Ouroboros Git Operations — Safe self-modification through git.
 *
 * Provides git operations with safety features:
 * - Auto-rescue uncommitted changes on startup
 * - Pre-push test gating
 * - Stable branch fallback
 * - Evolution stats from git history
 */

import { execSync } from "node:child_process";

export type GitStatus = {
  branch: string;
  sha: string;
  isDirty: boolean;
  uncommittedFiles: string[];
};

export type EvolutionStats = {
  totalCommits: number;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  recentCommits: Array<{
    sha: string;
    message: string;
    date: string;
  }>;
};

function run(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", timeout: 30_000 }).trim();
  } catch (err) {
    const error = err as { stderr?: string; message?: string };
    throw new Error(
      `Git command failed: ${cmd}\n${error.stderr ?? error.message}`,
    );
  }
}

/**
 * Get current git status.
 */
export function getStatus(repoDir: string): GitStatus {
  const branch = run("git rev-parse --abbrev-ref HEAD", repoDir);
  const sha = run("git rev-parse --short HEAD", repoDir);
  const statusOutput = run("git status --porcelain", repoDir);
  const uncommittedFiles = statusOutput
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3));

  return {
    branch,
    sha,
    isDirty: uncommittedFiles.length > 0,
    uncommittedFiles,
  };
}

/**
 * Auto-rescue uncommitted changes by stashing them.
 */
export function stashRescue(repoDir: string): string {
  const status = getStatus(repoDir);
  if (!status.isDirty) {
    return "No uncommitted changes to rescue.";
  }

  run('git stash push -m "ouroboros-auto-rescue"', repoDir);
  return `Stashed ${status.uncommittedFiles.length} uncommitted file(s).`;
}

/**
 * Get the diff of staged changes.
 */
export function getStagedDiff(repoDir: string): string {
  return run("git diff --cached", repoDir);
}

/**
 * Get the diff of all changes (staged + unstaged).
 */
export function getAllDiff(repoDir: string): string {
  return run("git diff HEAD", repoDir);
}

/**
 * Stage specific files.
 */
export function stageFiles(repoDir: string, files: string[]): void {
  for (const file of files) {
    run(`git add "${file}"`, repoDir);
  }
}

/**
 * Commit with a message. Returns the commit SHA.
 */
export function commit(repoDir: string, message: string): string {
  run(`git commit -m "${message.replace(/"/g, '\\"')}"`, repoDir);
  return run("git rev-parse --short HEAD", repoDir);
}

/**
 * Run tests before pushing. Returns true if tests pass.
 */
export function runTests(
  repoDir: string,
  testCommand: string,
): { passed: boolean; output: string } {
  try {
    const output = execSync(testCommand, {
      cwd: repoDir,
      encoding: "utf-8",
      timeout: 120_000,
    });
    return { passed: true, output };
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string };
    return {
      passed: false,
      output: (error.stdout ?? "") + (error.stderr ?? ""),
    };
  }
}

/**
 * Push to remote.
 */
export function push(repoDir: string): string {
  return run("git push", repoDir);
}

/**
 * Create or switch to the stable branch as a fallback point.
 */
export function promoteToStable(repoDir: string): string {
  const sha = run("git rev-parse --short HEAD", repoDir);
  try {
    run("git branch -D ouroboros-stable", repoDir);
  } catch {
    // Branch may not exist yet
  }
  run("git branch ouroboros-stable", repoDir);
  return `Promoted ${sha} to ouroboros-stable.`;
}

/**
 * Rollback to the stable branch.
 */
export function rollbackToStable(repoDir: string): string {
  try {
    run("git checkout ouroboros-stable", repoDir);
    return "Rolled back to ouroboros-stable.";
  } catch {
    return "No ouroboros-stable branch found. Cannot rollback.";
  }
}

/**
 * Get evolution stats from git history.
 */
export function getEvolutionStats(
  repoDir: string,
  limit = 20,
): EvolutionStats {
  const logOutput = run(
    `git log --oneline -${limit} --format="%h|%s|%ci"`,
    repoDir,
  );

  const recentCommits = logOutput
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, message, date] = line.split("|");
      return { sha, message, date };
    });

  let totalCommits = 0;
  try {
    totalCommits = parseInt(run("git rev-list --count HEAD", repoDir), 10);
  } catch {
    totalCommits = recentCommits.length;
  }

  let filesChanged = 0;
  let linesAdded = 0;
  let linesRemoved = 0;
  try {
    const shortstat = run(
      "git diff --shortstat HEAD~10 HEAD 2>/dev/null || echo ''",
      repoDir,
    );
    const filesMatch = shortstat.match(/(\d+) files? changed/);
    const addMatch = shortstat.match(/(\d+) insertions?/);
    const delMatch = shortstat.match(/(\d+) deletions?/);
    if (filesMatch) filesChanged = parseInt(filesMatch[1], 10);
    if (addMatch) linesAdded = parseInt(addMatch[1], 10);
    if (delMatch) linesRemoved = parseInt(delMatch[1], 10);
  } catch {
    // Ignore stats errors
  }

  return {
    totalCommits,
    filesChanged,
    linesAdded,
    linesRemoved,
    recentCommits,
  };
}
