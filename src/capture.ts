import { spawn } from "node:child_process";
import type { Writable } from "node:stream";
import { commandToString } from "./format.js";
import type { CommandResult } from "./types.js";

export interface OutputStreams {
  stdout?: Pick<Writable, "write">;
  stderr?: Pick<Writable, "write">;
}

export interface CaptureOptions {
  command: string[];
  cwd: string;
  streams?: OutputStreams;
  maxCaptureChars?: number;
}

interface Accumulator {
  append(value: string): void;
  text(): string;
  truncated(): boolean;
}

export async function captureCommand(options: CaptureOptions): Promise<CommandResult> {
  if (options.command.length === 0) {
    throw new Error("No command provided.");
  }

  const captureLimit = options.maxCaptureChars ?? 1_000_000;
  const stdout = createTailAccumulator(captureLimit);
  const stderr = createTailAccumulator(captureLimit);
  const combined = createTailAccumulator(captureLimit);
  const startedAt = Date.now();
  const [executable, ...args] = options.command;

  if (!executable) {
    throw new Error("No command executable provided.");
  }

  return new Promise((resolve) => {
    let spawnError: Error | null = null;
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: process.env,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout.append(text);
      combined.append(text);
      options.streams?.stdout?.write(chunk);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr.append(text);
      combined.append(text);
      options.streams?.stderr?.write(chunk);
    });

    child.on("error", (error) => {
      spawnError = error;
      const message = `failure-packager: failed to start ${commandToString(options.command)}: ${error.message}\n`;
      stderr.append(message);
      combined.append(message);
      options.streams?.stderr?.write(message);
    });

    child.on("close", (code, signal) => {
      const durationMs = Date.now() - startedAt;
      const exitCode = code ?? (spawnError ? 127 : signal ? 1 : 0);
      resolve({
        command: options.command,
        cwd: options.cwd,
        stdout: stdout.text(),
        stderr: stderr.text(),
        combinedOutput: combined.text(),
        exitCode,
        durationMs,
        signal,
        truncated: stdout.truncated() || stderr.truncated() || combined.truncated()
      });
    });
  });
}

function createTailAccumulator(limit: number): Accumulator {
  let value = "";
  let wasTruncated = false;
  const marker = "\n[failure-packager: beginning of captured stream truncated]\n";

  return {
    append(chunk: string): void {
      value += chunk;
      if (value.length > limit) {
        const keep = Math.max(0, limit - marker.length);
        value = `${marker}${value.slice(value.length - keep)}`;
        wasTruncated = true;
      }
    },
    text(): string {
      return value;
    },
    truncated(): boolean {
      return wasTruncated;
    }
  };
}
