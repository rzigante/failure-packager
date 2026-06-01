import { describe, expect, it } from "vitest";
import { detectFramework } from "../src/detect.js";

describe("detectFramework", () => {
  it("detects Vitest from command and output", () => {
    const framework = detectFramework(["npm", "test", "--", "vitest"], " RUN  v4.0.0\n Test Files  1 failed");
    expect(framework.id).toBe("vitest");
    expect(framework.confidence).toBe("high");
  });

  it("detects pytest from output", () => {
    const framework = detectFramework([], "=========================== FAILURES ===========================\nFAILED test_app.py::test_thing");
    expect(framework.id).toBe("pytest");
    expect(framework.confidence).not.toBe("low");
  });
});
