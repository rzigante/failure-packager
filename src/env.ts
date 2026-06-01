import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { EnvironmentContext, GitContext, GitStatusSummary } from "./types.js";

export function collectEnvironment(cwd: string): EnvironmentContext {
  const context: EnvironmentContext = {
    cwd,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version
  };

  const npmVersion = runQuiet("npm", ["--version"], cwd);
  if (npmVersion) {
    context.npmVersion = npmVersion;
  }

  const packageManager = detectPackageManager(cwd);
  if (packageManager) {
    context.packageManager = packageManager;
  }

  const git = collectGitContext(cwd);
  if (git) {
    context.git = git;
  }

  return context;
}

function collectGitContext(cwd: string): GitContext | undefined {
  if (runQuiet("git", ["rev-parse", "--is-inside-work-tree"], cwd) !== "true") {
    return undefined;
  }

  const status = runQuiet("git", ["status", "--short"], cwd) ?? "";
  const statusLines = status.split("\n").filter(Boolean);
  const git: GitContext = {
    statusSummary: summarizeGitStatus(statusLines),
    changedFiles: statusLines.map((line) => line.slice(3).trim()).filter(Boolean).slice(0, 50)
  };

  const branch = runQuiet("git", ["branch", "--show-current"], cwd);
  if (branch) {
    git.branch = branch;
  }

  const sha = runQuiet("git", ["rev-parse", "--short", "HEAD"], cwd);
  if (sha) {
    git.sha = sha;
  }

  return git;
}

function summarizeGitStatus(lines: string[]): GitStatusSummary {
  const summary: GitStatusSummary = {
    clean: lines.length === 0,
    changed: lines.length,
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0
  };

  for (const line of lines) {
    const status = line.slice(0, 2);
    if (status === "??") {
      summary.untracked += 1;
      continue;
    }
    if (status.includes("M")) summary.modified += 1;
    if (status.includes("A")) summary.added += 1;
    if (status.includes("D")) summary.deleted += 1;
    if (status.includes("R")) summary.renamed += 1;
  }

  return summary;
}

function detectPackageManager(cwd: string): string | undefined {
  const packageJson = findUp("package.json", cwd);
  if (packageJson) {
    try {
      const parsed = JSON.parse(readFileSync(packageJson, "utf8")) as { packageManager?: string };
      if (typeof parsed.packageManager === "string" && parsed.packageManager.trim()) {
        return parsed.packageManager.trim();
      }
    } catch {
      // Fall through to lockfile detection.
    }
  }

  const locks: Array<[string, string]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
    ["bun.lockb", "bun"],
    ["bun.lock", "bun"]
  ];

  for (const [file, manager] of locks) {
    if (findUp(file, cwd)) {
      return manager;
    }
  }

  return undefined;
}

function findUp(fileName: string, fromDirectory: string): string | undefined {
  let current = path.resolve(fromDirectory);
  while (true) {
    const candidate = path.join(current, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function runQuiet(command: string, args: string[], cwd: string): string | undefined {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 3000,
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"]
  });

  if (result.error || result.status !== 0) {
    return undefined;
  }

  const output = result.stdout.trim();
  return output.length > 0 ? output : undefined;
}
