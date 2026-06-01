import { describe, expect, it } from "vitest";
import { detectFramework } from "../src/detect.js";
import { extractFailures } from "../src/extract.js";

const vitestLog = `
 FAIL  test/math.test.ts > math > adds
AssertionError: expected 2 to equal 3
 ❯ test/math.test.ts:7:20

 Test Files  1 failed (1)
      Tests  1 failed (1)
`;

const playwrightLog = `
  1) [chromium] › tests/login.spec.ts:12:3 › login works

    Error: expect(locator).toBeVisible()
    at tests/login.spec.ts:18:22

    attachment #1: screenshot (image/png) - test-results/login-works-chromium/test-failed-1.png
    attachment #2: video (video/webm) - test-results/login-works-chromium/video.webm
    attachment #3: trace (application/zip) - test-results/login-works-chromium/trace.zip
`;

describe("extractFailures", () => {
  it("extracts blocks, assertion messages, summaries, and file references", () => {
    const extraction = extractFailures(vitestLog, detectFramework(["vitest"], vitestLog));

    expect(extraction.blocks.length).toBeGreaterThan(0);
    expect(extraction.assertionMessages.join("\n")).toContain("AssertionError");
    expect(extraction.fileReferences).toContain("test/math.test.ts:7:20");
    expect(extraction.summaryLines.join("\n")).toContain("Test Files");
  });

  it("extracts Playwright artifacts from failure logs", () => {
    const extraction = extractFailures(playwrightLog, detectFramework(["playwright", "test"], playwrightLog));

    expect(extraction.artifactReferences).toEqual([
      expect.objectContaining({ kind: "screenshot", path: "test-results/login-works-chromium/test-failed-1.png" }),
      expect.objectContaining({ kind: "video", path: "test-results/login-works-chromium/video.webm" }),
      expect.objectContaining({ kind: "trace", path: "test-results/login-works-chromium/trace.zip" })
    ]);
  });
});
