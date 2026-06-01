const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

const SECRET_ASSIGNMENT_PATTERN =
  /\b((?:[A-Z0-9_.-]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|ACCESS[_-]?KEY|CLIENT[_-]?SECRET|AUTH)[A-Z0-9_.-]*)\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi;

export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, "");
}

export function normalizeNewlines(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function redactSecrets(input: string): string {
  return input
    .replace(/(Authorization:\s*Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{20,}/gi, "$1[REDACTED]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "$1$2[REDACTED]")
    .replace(/(https?:\/\/)([^:\s/@]+):([^@\s/]+)@/gi, "$1[REDACTED]:[REDACTED]@");
}

export function sanitizeLog(input: string): string {
  return redactSecrets(stripAnsi(normalizeNewlines(input)));
}

export function truncateText(
  input: string,
  maxChars: number,
  options: { fromEnd?: boolean; marker?: string } = {}
): { text: string; truncated: boolean; originalChars: number } {
  const originalChars = input.length;
  if (maxChars <= 0) {
    return { text: "", truncated: originalChars > 0, originalChars };
  }

  if (input.length <= maxChars) {
    return { text: input, truncated: false, originalChars };
  }

  const marker = options.marker ?? "[failure-packager: log truncated]";
  const markerText = `\n${marker}\n`;
  const available = Math.max(0, maxChars - markerText.length);
  if (options.fromEnd) {
    return {
      text: `${markerText}${input.slice(input.length - available)}`,
      truncated: true,
      originalChars
    };
  }

  return {
    text: `${input.slice(0, available)}${markerText}`,
    truncated: true,
    originalChars
  };
}

export function uniqueStrings(values: string[], limit = Number.POSITIVE_INFINITY): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}
