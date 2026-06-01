import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Writable } from "node:stream";
import { captureCommand } from "./capture.js";
import { detectFramework } from "./detect.js";
import { collectEnvironment } from "./env.js";
import { extractFailures } from "./extract.js";
import { buildJsonReport, buildMarkdownReport, writeTextFile } from "./report.js";
import type { ReportInput, RunMode } from "./types.js";
import { VERSION } from "./version.js";

const DEFAULT_OUTPUT = "failure-report.md";
const DEFAULT_MAX_LOG_CHARS = 60_000;
const MAX_INGEST_BYTES = 2_000_000;

export interface CliStreams {
  stdout: Pick<Writable, "write">;
  stderr: Pick<Writable, "write">;
}

export interface CliOptions {
  mode: RunMode;
  cwd: string;
  output: string;
  json?: string;
  maxLogChars: number;
  includeFullLog: boolean;
  reportOnly: boolean;
  command?: string[];
  logFile?: string;
}

type ParseResult =
  | { ok: true; options: CliOptions }
  | { ok: false; exitCode: number; message?: string; help?: boolean; version?: boolean };

export async function runCli(
  argv: string[],
  streams: CliStreams = { stdout: process.stdout, stderr: process.stderr }
): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    if (parsed.version) {
      streams.stdout.write(`${VERSION}\n`);
      return parsed.exitCode;
    }
    if (parsed.message) {
      streams.stderr.write(`${parsed.message}\n\n`);
    }
    if (parsed.help) {
      streams.stdout.write(helpText());
    }
    return parsed.exitCode;
  }

  const options = parsed.options;
  try {
    await assertDirectory(options.cwd);
  } catch (error) {
    streams.stderr.write(`${formatError(error)}\n`);
    return 2;
  }

  try {
    const reportInput = await createReportInput(options, streams);
    const markdown = buildMarkdownReport(reportInput);
    const jsonReport = buildJsonReport(reportInput);

    await writeOutput(options.output, markdown, streams.stdout);
    streams.stderr.write(`failure-packager: wrote ${options.output}\n`);

    if (options.json) {
      const json = `${JSON.stringify(jsonReport, null, 2)}\n`;
      await writeOutput(options.json, json, streams.stdout);
      streams.stderr.write(`failure-packager: wrote ${options.json}\n`);
    }

    if (options.reportOnly || options.mode === "log") {
      return 0;
    }

    return reportInput.exitCode ?? 1;
  } catch (error) {
    streams.stderr.write(`${formatError(error)}\n`);
    return 1;
  }
}

export function parseArgs(argv: string[]): ParseResult {
  const separatorIndex = argv.indexOf("--");
  const optionArgs = separatorIndex >= 0 ? argv.slice(0, separatorIndex) : argv;
  const command = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : [];

  const partial: {
    cwd?: string;
    output?: string;
    json?: string;
    maxLogChars?: number;
    includeFullLog: boolean;
    reportOnly: boolean;
    logFile?: string;
  } = {
    includeFullLog: false,
    reportOnly: false
  };

  try {
    for (let index = 0; index < optionArgs.length; index += 1) {
      const arg = optionArgs[index];
      if (!arg) continue;

      switch (arg) {
        case "--help":
        case "-h":
          return { ok: false, exitCode: 0, help: true };
        case "--version":
        case "-v":
          return { ok: false, exitCode: 0, version: true };
        case "--log":
          partial.logFile = readOptionValue(optionArgs, ++index, "--log");
          break;
        case "--output":
          partial.output = readOptionValue(optionArgs, ++index, "--output");
          break;
        case "--json":
          partial.json = readOptionValue(optionArgs, ++index, "--json");
          break;
        case "--max-log-chars": {
          const value = Number.parseInt(readOptionValue(optionArgs, ++index, "--max-log-chars"), 10);
          if (!Number.isSafeInteger(value) || value < 0) {
            return { ok: false, exitCode: 2, message: "--max-log-chars must be a non-negative integer.", help: true };
          }
          partial.maxLogChars = value;
          break;
        }
        case "--include-full-log":
          partial.includeFullLog = true;
          break;
        case "--report-only":
          partial.reportOnly = true;
          break;
        case "--cwd":
          partial.cwd = readOptionValue(optionArgs, ++index, "--cwd");
          break;
        default:
          return {
            ok: false,
            exitCode: 2,
            message: arg.startsWith("-") ? `Unknown option: ${arg}` : `Unexpected argument before --: ${arg}`,
            help: true
          };
      }
    }
  } catch (error) {
    return { ok: false, exitCode: 2, message: formatError(error), help: true };
  }

  if (partial.logFile && command.length > 0) {
    return { ok: false, exitCode: 2, message: "Use either --log <file> or a command after --, not both.", help: true };
  }

  if (!partial.logFile && command.length === 0) {
    return { ok: false, exitCode: 2, message: "Provide --log <file> or a command after --.", help: true };
  }

  const cwd = path.resolve(process.cwd(), partial.cwd ?? ".");
  const output = partial.output ?? DEFAULT_OUTPUT;
  const maxLogChars = partial.maxLogChars ?? DEFAULT_MAX_LOG_CHARS;

  if (partial.logFile) {
    return {
      ok: true,
      options: {
        mode: "log",
        cwd,
        output,
        maxLogChars,
        includeFullLog: partial.includeFullLog,
        reportOnly: partial.reportOnly,
        logFile: path.resolve(process.cwd(), partial.logFile),
        ...(partial.json ? { json: partial.json } : {})
      }
    };
  }

  return {
    ok: true,
    options: {
      mode: "run",
      cwd,
      output,
      maxLogChars,
      includeFullLog: partial.includeFullLog,
      reportOnly: partial.reportOnly,
      command,
      ...(partial.json ? { json: partial.json } : {})
    }
  };
}

export function helpText(): string {
  return `failure-packager ${VERSION}

Usage:
  failure-packager [options] -- <command> [args...]
  failure-packager [options] --log <file>

Options:
  --log <file>             Read an existing log file instead of running a command.
  --output <file>          Write Markdown report. Defaults to ${DEFAULT_OUTPUT}.
  --json <file>            Write machine-readable JSON report.
  --max-log-chars <n>      Maximum sanitized log characters included in reports. Defaults to ${DEFAULT_MAX_LOG_CHARS}.
  --include-full-log       Include the sanitized full captured log, capped for safety.
  --report-only            Always exit 0 after writing reports.
  --cwd <path>             Working directory used for command execution and environment context.
  --help                   Show help.
  --version                Show version.

Examples:
  failure-packager -- npm test
  failure-packager --output report.md --json report.json -- pnpm test
  failpack --log ./test-output.log --output report.md
`;
}

async function createReportInput(options: CliOptions, streams: CliStreams): Promise<ReportInput> {
  if (options.mode === "log") {
    if (!options.logFile) {
      throw new Error("Missing log file path.");
    }

    const log = await readLogFile(options.logFile, options.includeFullLog, options.maxLogChars);
    const framework = detectFramework([], log);
    const extraction = extractFailures(log, framework);
    return {
      mode: "log",
      generatedAt: new Date().toISOString(),
      cwd: options.cwd,
      logFile: options.logFile,
      exitCode: null,
      durationMs: null,
      framework,
      extraction,
      environment: collectEnvironment(options.cwd),
      rawLog: log,
      includeFullLog: options.includeFullLog,
      maxLogChars: options.maxLogChars
    };
  }

  if (!options.command) {
    throw new Error("Missing command.");
  }

  const capture = await captureCommand({
    command: options.command,
    cwd: options.cwd,
    streams,
    maxCaptureChars: Math.min(MAX_INGEST_BYTES, Math.max(options.maxLogChars * 2, 200_000))
  });
  const framework = detectFramework(options.command, capture.combinedOutput);
  const extraction = extractFailures(capture.combinedOutput, framework);

  return {
    mode: "run",
    generatedAt: new Date().toISOString(),
    cwd: options.cwd,
    command: options.command,
    exitCode: capture.exitCode,
    durationMs: capture.durationMs,
    framework,
    extraction,
    environment: collectEnvironment(options.cwd),
    rawLog: capture.combinedOutput,
    includeFullLog: options.includeFullLog,
    maxLogChars: options.maxLogChars
  };
}

async function readLogFile(filePath: string, includeFullLog: boolean, maxLogChars: number): Promise<string> {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    throw new Error(`Log path is not a file: ${filePath}`);
  }

  const byteLimit = Math.min(MAX_INGEST_BYTES, includeFullLog ? MAX_INGEST_BYTES : Math.max(maxLogChars * 2, 200_000));
  if (fileStat.size <= byteLimit) {
    return readFile(filePath, "utf8");
  }

  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(byteLimit);
    await handle.read(buffer, 0, byteLimit, fileStat.size - byteLimit);
    return `[failure-packager: log file exceeded ${byteLimit} bytes; showing tail]\n${buffer.toString("utf8")}`;
  } finally {
    await handle.close();
  }
}

async function writeOutput(target: string, content: string, stdout: Pick<Writable, "write">): Promise<void> {
  if (target === "-") {
    stdout.write(content);
    return;
  }

  await writeTextFile(path.resolve(process.cwd(), target), content);
}

async function assertDirectory(directory: string): Promise<void> {
  const directoryStat = await stat(directory);
  if (!directoryStat.isDirectory()) {
    throw new Error(`Working directory is not a directory: ${directory}`);
  }
}

function readOptionValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new CliUsageError(`${option} requires a value.`);
  }
  return value;
}

function formatError(error: unknown): string {
  if (error instanceof CliUsageError) {
    return error.message;
  }
  if (error instanceof Error) {
    return `failure-packager: ${error.message}`;
  }
  return `failure-packager: ${String(error)}`;
}

class CliUsageError extends Error {}
