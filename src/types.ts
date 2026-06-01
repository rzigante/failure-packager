export type RunMode = "run" | "log";

export type FrameworkId =
  | "vitest"
  | "jest"
  | "pytest"
  | "playwright"
  | "go-test"
  | "cargo-test"
  | "node"
  | "unknown";

export interface DetectedFramework {
  id: FrameworkId;
  name: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
}

export interface CommandResult {
  command: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  combinedOutput: string;
  exitCode: number;
  durationMs: number;
  signal: NodeJS.Signals | null;
  truncated: boolean;
}

export interface FailureBlock {
  title: string;
  text: string;
  startLine: number;
  endLine: number;
}

export interface ExtractionResult {
  blocks: FailureBlock[];
  assertionMessages: string[];
  stackTraces: string[];
  fileReferences: string[];
  summaryLines: string[];
}

export interface GitStatusSummary {
  clean: boolean;
  changed: number;
  modified: number;
  added: number;
  deleted: number;
  renamed: number;
  untracked: number;
}

export interface GitContext {
  branch?: string;
  sha?: string;
  statusSummary: GitStatusSummary;
  changedFiles: string[];
}

export interface EnvironmentContext {
  cwd: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  npmVersion?: string;
  packageManager?: string;
  git?: GitContext;
}

export interface ReportLog {
  included: "excerpt" | "full";
  text: string;
  truncated: boolean;
  originalChars: number;
}

export interface ReportInput {
  mode: RunMode;
  generatedAt: string;
  cwd: string;
  command?: string[];
  logFile?: string;
  exitCode: number | null;
  durationMs: number | null;
  framework: DetectedFramework;
  extraction: ExtractionResult;
  environment: EnvironmentContext;
  rawLog: string;
  includeFullLog: boolean;
  maxLogChars: number;
}

export interface JsonReport {
  schemaVersion: "1.0.0";
  generatedAt: string;
  mode: RunMode;
  cwd: string;
  command: string[] | null;
  logFile: string | null;
  exitCode: number | null;
  durationMs: number | null;
  framework: DetectedFramework;
  failures: ExtractionResult;
  environment: EnvironmentContext;
  log: ReportLog;
}
