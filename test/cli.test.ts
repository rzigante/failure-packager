import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

function streams() {
  let stdout = "";
  let stderr = "";
  return {
    stdout: { write: (chunk: unknown) => { stdout += String(chunk); return true; } },
    stderr: { write: (chunk: unknown) => { stderr += String(chunk); return true; } },
    read: () => ({ stdout, stderr })
  };
}

describe("runCli", () => {
  it("packages an existing log and writes markdown plus JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "failpack-log-"));
    const logPath = join(dir, "test.log");
    const mdPath = join(dir, "report.md");
    const jsonPath = join(dir, "report.json");
    await writeFile(logPath, "FAIL test/app.test.ts\nAssertionError: expected 1 to equal 2\n    at test/app.test.ts:3:4\n");

    const io = streams();
    const exitCode = await runCli(["--log", logPath, "--output", mdPath, "--json", jsonPath], io);

    expect(exitCode).toBe(0);
    expect(await readFile(mdPath, "utf8")).toContain("Failure Report");
    expect(JSON.parse(await readFile(jsonPath, "utf8")).failures.assertionMessages[0]).toContain("AssertionError");
  });

  it("mirrors command exit code unless report-only is set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "failpack-run-"));
    const mdPath = join(dir, "report.md");
    const command = ["node", "-e", "console.error('AssertionError: expected false to be true'); process.exit(7)"];

    const io = streams();
    await expect(runCli(["--output", mdPath, "--", ...command], io)).resolves.toBe(7);
    expect(await readFile(mdPath, "utf8")).toContain("AssertionError");

    const reportOnlyPath = join(dir, "report-only.md");
    await expect(runCli(["--report-only", "--output", reportOnlyPath, "--", ...command], streams())).resolves.toBe(0);
  });

  it("prints help for invalid usage", async () => {
    const io = streams();
    const exitCode = await runCli([], io);
    expect(exitCode).toBe(2);
    expect(io.read().stderr).toContain("Provide --log");
    expect(io.read().stdout).toContain("Usage:");
  });
});
