import { sanitizeLog, truncateText, uniqueStrings } from "./sanitize.js";
import type { DetectedFramework, ExtractionResult, FailureBlock } from "./types.js";

interface LineRange {
  start: number;
  end: number;
}

const MAX_BLOCKS = 8;
const MAX_BLOCK_CHARS = 6000;

export function extractFailures(rawLog: string, framework: DetectedFramework): ExtractionResult {
  const log = sanitizeLog(rawLog);
  const lines = log.split("\n");
  const fileReferences = collectFileReferences(lines);
  const assertionMessages = collectAssertionMessages(lines);
  const stackTraces = collectStackTraces(lines);
  const summaryLines = collectSummaryLines(lines);
  const blocks = collectFailureBlocks(lines, framework);

  return {
    blocks,
    assertionMessages,
    stackTraces,
    fileReferences,
    summaryLines
  };
}

function collectFailureBlocks(lines: string[], framework: DetectedFramework): FailureBlock[] {
  const anchors = findAnchorLines(lines, framework);
  if (anchors.length === 0) {
    const fallback = lastNonEmptyRange(lines, 40);
    return fallback ? [rangeToBlock(lines, fallback, 1)] : [];
  }

  const ranges = mergeRanges(
    anchors.map((anchor) => ({
      start: Math.max(0, anchor - 4),
      end: Math.min(lines.length - 1, anchor + 16)
    }))
  );

  return ranges.slice(0, MAX_BLOCKS).map((range, index) => rangeToBlock(lines, range, index + 1));
}

function findAnchorLines(lines: string[], framework: DetectedFramework): number[] {
  const anchors: number[] = [];
  const patterns = [
    /^\s*(?:FAIL|FAILED|ERROR)\b/,
    /\bAssertionError\b|\bAssertion failed\b|\bExpected\b|\bReceived\b|\bexpect\(/i,
    /^\s*at\s+.+:\d+:\d+/,
    /^\s*File ".*", line \d+/,
    /Traceback \(most recent call last\):/,
    /^--- FAIL:/,
    /thread '.*' panicked at/i,
    /^test result: FAILED\./,
    /^error: test failed/i,
    /\bpanic:|\bpanicked at\b/i
  ];

  const frameworkPatterns: Partial<Record<typeof framework.id, RegExp[]>> = {
    vitest: [/^\s*❯\s+/, /\bTest Files\s+\d+\s+failed/i],
    jest: [/^\s*●\s+/, /\bTest Suites:\s+\d+\s+failed/i],
    pytest: [/=+\s*FAILURES\s*=+/i, /^_{3,}\s+.+\s+_{3,}$/],
    playwright: [/^\s*\d+\)\s+\[.*\]\s+.+\s+›\s+/, /Error:\s+expect\(.+\)\./],
    "go-test": [/^FAIL\t/, /^\s+.+\.go:\d+:/],
    "cargo-test": [/^----\s+.+\s+stdout\s+----/, /^failures:\s*$/i]
  };

  const allPatterns = [...patterns, ...(frameworkPatterns[framework.id] ?? [])];
  lines.forEach((line, index) => {
    if (allPatterns.some((pattern) => pattern.test(line))) {
      anchors.push(index);
    }
  });

  return uniqueNumbers(anchors);
}

function rangeToBlock(lines: string[], range: LineRange, index: number): FailureBlock {
  const text = trimBlankLines(lines.slice(range.start, range.end + 1)).join("\n");
  const truncated = truncateText(text, MAX_BLOCK_CHARS);
  return {
    title: deriveTitle(text, index),
    text: truncated.text,
    startLine: range.start + 1,
    endLine: range.end + 1
  };
}

function deriveTitle(text: string, index: number): string {
  const firstUsefulLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !/^[|`-]+$/.test(line));

  if (!firstUsefulLine) {
    return `Block ${index}`;
  }

  const title = firstUsefulLine.replace(/\s+/g, " ");
  return title.length > 90 ? `${title.slice(0, 87)}...` : title;
}

function mergeRanges(ranges: LineRange[]): LineRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: LineRange[] = [];

  for (const range of sorted) {
    const previous = merged.at(-1);
    if (!previous || range.start > previous.end + 4) {
      merged.push({ ...range });
      continue;
    }
    previous.end = Math.max(previous.end, range.end);
  }

  return merged;
}

function lastNonEmptyRange(lines: string[], maxLines: number): LineRange | null {
  let end = lines.length - 1;
  while (end >= 0 && lines[end]?.trim() === "") {
    end -= 1;
  }
  if (end < 0) {
    return null;
  }
  return { start: Math.max(0, end - maxLines + 1), end };
}

function collectAssertionMessages(lines: string[]): string[] {
  const matches: string[] = [];
  const patterns = [
    /\bAssertionError\b.*/i,
    /\bAssertion failed\b.*/i,
    /\bExpected\b.*/i,
    /\bReceived\b.*/i,
    /Error:\s+expect\(.*/i,
    /^\s*E\s+AssertionError:.*/i,
    /thread '.*' panicked at.*/i,
    /\bpanic:.*/i
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (patterns.some((pattern) => pattern.test(trimmed))) {
      matches.push(trimmed);
    }
  }

  return uniqueStrings(matches, 20);
}

function collectStackTraces(lines: string[]): string[] {
  const traces: string[] = [];
  let current: string[] = [];

  const flush = (): void => {
    if (current.length > 0) {
      traces.push(current.slice(0, 30).join("\n"));
      current = [];
    }
  };

  for (const line of lines) {
    if (isStackLine(line)) {
      current.push(line);
      continue;
    }

    flush();
  }
  flush();

  return uniqueStrings(traces, 10);
}

function isStackLine(line: string): boolean {
  return (
    /^\s*at\s+.+/.test(line) ||
    /^\s*File ".*", line \d+/.test(line) ||
    /^\s*from\s+.+:\d+/.test(line) ||
    /^\s+\d+:\s+.+/.test(line) ||
    /^\s*❯\s+.+:\d+:\d+/.test(line)
  );
}

function collectFileReferences(lines: string[]): string[] {
  const refs: string[] = [];
  const pathWithLine =
    /(?:^|[\s(["'])(\.{0,2}\/?[A-Za-z0-9_@./-]+\.(?:[cm]?[jt]sx?|py|go|rs|java|rb|php|cs|kt|swift):\d+(?::\d+)?)/g;
  const pytestNode = /([A-Za-z0-9_@./-]+\.py::[A-Za-z0-9_:[\]-]+)/g;
  const pythonFile = /File "([^"]+)", line (\d+)/g;
  const rustPanic = /panicked at ([A-Za-z0-9_@./-]+\.rs:\d+:\d+)/g;

  for (const line of lines) {
    collectMatches(line, pathWithLine, refs);
    collectMatches(line, pytestNode, refs);

    for (const match of line.matchAll(pythonFile)) {
      if (match[1] && match[2]) {
        refs.push(`${match[1]}:${match[2]}`);
      }
    }

    for (const match of line.matchAll(rustPanic)) {
      if (match[1]) {
        refs.push(match[1]);
      }
    }
  }

  return uniqueStrings(
    refs.map((ref) => ref.replace(/[),.;]+$/g, "")),
    50
  );
}

function collectMatches(line: string, pattern: RegExp, refs: string[]): void {
  for (const match of line.matchAll(pattern)) {
    if (match[1]) {
      refs.push(match[1]);
    }
  }
}

function collectSummaryLines(lines: string[]): string[] {
  const patterns = [
    /\bTest Files\b/i,
    /\bTest Suites\b/i,
    /\bTests\b.*\bfailed\b/i,
    /\bSnapshots\b/i,
    /\bDuration\b|\bTime\b/i,
    /Ran all test suites/i,
    /short test summary info/i,
    /^\s*=+\s*\d+\s+failed/i,
    /^\s*\d+\s+(?:failed|passed|skipped|xfailed|xpassed|error)s?\b/i,
    /^FAILED\s+.+/i,
    /^FAIL\s+.+/i,
    /^test result: FAILED\./i,
    /^error: test failed/i,
    /^failures:\s*$/i
  ];

  return uniqueStrings(
    lines
      .map((line) => line.trim())
      .filter((line) => patterns.some((pattern) => pattern.test(line))),
    25
  );
}

function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length - 1;
  while (start <= end && lines[start]?.trim() === "") start += 1;
  while (end >= start && lines[end]?.trim() === "") end -= 1;
  return lines.slice(start, end + 1);
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}
