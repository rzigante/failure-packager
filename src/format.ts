export function quoteArg(arg: string): string {
  if (/^[A-Za-z0-9_./:=@%+,-]+$/.test(arg)) {
    return arg;
  }
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export function commandToString(command: string[]): string {
  return command.map(quoteArg).join(" ");
}

export function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return "not captured";
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(2)}s`;
}

export function formatExitCode(exitCode: number | null): string {
  return exitCode === null ? "not captured" : String(exitCode);
}
