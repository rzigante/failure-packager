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

describe("extractFailures", () => {
  it("extracts blocks, assertion messages, summaries, and file references", () => {
    const extraction = extractFailures(vitestLog, detectFramework(["vitest"], vitestLog));

    expect(extraction.blocks.length).toBeGreaterThan(0);
    expect(extraction.assertionMessages.join("\n")).toContain("AssertionError");
    expect(extraction.fileReferences).toContain("test/math.test.ts:7:20");
    expect(extraction.summaryLines.join("\n")).toContain("Test Files");
  });
});
