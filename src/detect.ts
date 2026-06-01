import type { DetectedFramework, FrameworkId } from "./types.js";

interface Candidate {
  id: FrameworkId;
  name: string;
  score: number;
  evidence: string[];
}

const FRAMEWORK_NAMES: Record<FrameworkId, string> = {
  vitest: "Vitest",
  jest: "Jest",
  pytest: "pytest",
  playwright: "Playwright",
  "go-test": "Go test",
  "cargo-test": "Cargo test",
  node: "Node/npm generic",
  unknown: "Unknown"
};

export function detectFramework(command: string[] = [], output = ""): DetectedFramework {
  const commandText = command.join(" ").toLowerCase();
  const outputText = output.toLowerCase();
  const candidates: Candidate[] = [];

  const add = (id: FrameworkId, score: number, evidence: string): void => {
    let candidate = candidates.find((item) => item.id === id);
    if (!candidate) {
      candidate = { id, name: FRAMEWORK_NAMES[id], score: 0, evidence: [] };
      candidates.push(candidate);
    }
    candidate.score += score;
    candidate.evidence.push(evidence);
  };

  if (/\bvitest\b/.test(commandText)) add("vitest", 5, "command mentions vitest");
  if (/\bvitest\b/.test(outputText) || /\brun\s+v\d+\.\d+\.\d+/.test(outputText)) {
    add("vitest", 4, "output looks like Vitest");
  }
  if (/^(\s*)❯/m.test(output) || /\bTest Files\s+\d+\s+failed/i.test(output)) {
    add("vitest", 3, "output contains Vitest failure markers");
  }

  if (/\bjest\b/.test(commandText)) add("jest", 5, "command mentions jest");
  if (/\bTest Suites:\s+\d+\s+failed/i.test(output) || /^FAIL\s+.+\.(?:test|spec)\.[cm]?[jt]sx?/m.test(output)) {
    add("jest", 4, "output looks like Jest");
  }
  if (/^\s*●\s+/m.test(output)) add("jest", 3, "output contains Jest test failure marker");

  if (/\bpytest\b/.test(commandText)) add("pytest", 5, "command mentions pytest");
  if (/=+\s*(?:short test summary info|FAILURES)\s*=+/i.test(output)) {
    add("pytest", 4, "output contains pytest summary section");
  }
  if (/^FAILED\s+.+\.py::/m.test(output) || /^\s*E\s+AssertionError:/m.test(output)) {
    add("pytest", 3, "output contains pytest failure lines");
  }

  if (/\bplaywright\b/.test(commandText)) add("playwright", 5, "command mentions playwright");
  if (/@playwright\/test/i.test(output) || /\bnpx\s+playwright\s+test\b/i.test(output)) {
    add("playwright", 4, "output mentions Playwright test");
  }
  if (/^\s*\d+\)\s+\[.*\]\s+.+\s+›\s+/m.test(output) || /Error:\s+expect\(.+\)\./.test(output)) {
    add("playwright", 3, "output contains Playwright-style failure");
  }

  if (/\bgo\s+test\b/.test(commandText)) add("go-test", 5, "command is go test");
  if (/^--- FAIL:/m.test(output) || /^FAIL\s+\S+\s+\d/m.test(output) || /^FAIL\t/m.test(output)) {
    add("go-test", 4, "output looks like go test");
  }

  if (/\bcargo\s+test\b/.test(commandText)) add("cargo-test", 5, "command is cargo test");
  if (/thread '.*' panicked at/i.test(output) || /^test result: FAILED\./m.test(output)) {
    add("cargo-test", 4, "output looks like cargo test");
  }
  if (/^failures:\s*$/im.test(output) && /\.rs:\d+:\d+/.test(output)) {
    add("cargo-test", 3, "output contains Rust failure references");
  }

  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|unit|e2e|spec|check)\b/.test(commandText)) {
    add("node", 2, "command is a Node package script");
  }
  if (/^(?:node|tsx|ts-node)\b/.test(commandText)) {
    add("node", 2, "command runs Node tooling");
  }
  if (/\b(?:npm ERR!|ELIFECYCLE|ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL)\b/i.test(output)) {
    add("node", 1, "output contains package-manager failure markers");
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) {
    return {
      id: "unknown",
      name: FRAMEWORK_NAMES.unknown,
      confidence: "low",
      evidence: ["no known framework markers found"]
    };
  }

  const confidence = best.score >= 5 ? "high" : best.score >= 3 ? "medium" : "low";
  return {
    id: best.id,
    name: best.name,
    confidence,
    evidence: [...new Set(best.evidence)].slice(0, 5)
  };
}
