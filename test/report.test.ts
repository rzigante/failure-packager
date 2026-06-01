import { describe, expect, it } from "vitest";
import { buildJsonReport, buildMarkdownReport, prepareLog } from "../src/report.js";
import type { ReportInput } from "../src/types.js";

const input: ReportInput = {
  mode: "log",
  generatedAt: "2026-06-01T00:00:00.000Z",
  cwd: "/repo",
  logFile: "/repo/test.log",
  exitCode: null,
  durationMs: null,
  framework: {
    id: "jest",
    name: "Jest",
    confidence: "high",
    evidence: ["test"]
  },
  extraction: {
    blocks: [
      {
        title: "FAIL test/app.test.ts",
        text: "FAIL test/app.test.ts\nExpected: 1\nReceived: 2",
        startLine: 1,
        endLine: 3
      }
    ],
    assertionMessages: ["Expected: 1"],
    stackTraces: [],
    fileReferences: ["test/app.test.ts:4:10"],
    summaryLines: ["Test Suites: 1 failed"]
  },
  environment: {
    cwd: "/repo",
    platform: "darwin",
    arch: "arm64",
    nodeVersion: "v24.0.0"
  },
  rawLog: "TOKEN=super-secret-value\nFAIL test/app.test.ts",
  includeFullLog: false,
  maxLogChars: 1000
};

describe("report", () => {
  it("builds markdown and JSON reports", () => {
    expect(buildMarkdownReport(input)).toContain("# Failure Report");
    expect(buildMarkdownReport(input)).toContain("test/app.test.ts:4:10");
    expect(buildJsonReport(input).failures.blocks[0]?.title).toContain("FAIL");
  });

  it("sanitizes and truncates logs", () => {
    const log = prepareLog("API_TOKEN=abc123456789\n".repeat(20), 200, false);
    expect(log.text).toContain("[REDACTED]");
    expect(log.truncated).toBe(true);
  });
});
