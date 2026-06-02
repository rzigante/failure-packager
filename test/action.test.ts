import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("action metadata", () => {
  it("builds upload paths dynamically so an empty JSON output does not upload the working directory", async () => {
    const action = await readFile("action.yml", "utf8");

    expect(action).toContain("steps.report-paths.outputs.paths");
    expect(action).toContain('if [[ -n "${{ inputs.json }}" ]]; then');
    expect(action).not.toContain("${{ inputs.cwd }}/${{ inputs.json }}\n        if-no-files-found");
  });

  it("installs from the checked-out action ref and wraps shell commands as one captured command", async () => {
    const action = await readFile("action.yml", "utf8");

    expect(action).toContain('package_source="${FAILURE_PACKAGER_PACKAGE_SOURCE:-${{ github.action_path }}}"');
    expect(action).toContain("npm install --no-save \"$package_source\"");
    expect(action).toContain("FAILURE_PACKAGER_COMMAND: ${{ inputs.command }}");
    expect(action).toContain('npx failure-packager "${args[@]}" -- bash -lc "$FAILURE_PACKAGER_COMMAND"');
  });
});
