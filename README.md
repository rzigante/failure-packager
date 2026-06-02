# failure-packager

`failure-packager` turns failing test runs or saved logs into compact, useful reports for engineers and AI coding agents. It captures command output, detects the likely test framework, extracts the important failure blocks, records safe environment context, and writes Markdown plus optional JSON.

The CLI is also available as `failpack`.

## Install

```sh
npm install --save-dev github:michaelko/failure-packager
```

Or run from a checkout:

```sh
npm install
npm run build
npx failure-packager -- npm test
```

## Usage

Run a command after `--`:

```sh
npx failure-packager --output failure-report.md --json failure-report.json -- npm test
```

Ingest an existing log without running a command:

```sh
npx failpack --log ./test-output.log --output failure-report.md --json failure-report.json
```

Keep CI green while still producing a report:

```sh
npx failure-packager --report-only -- npm test
```

Run in another directory:

```sh
npx failure-packager --cwd packages/api --output api-failure.md -- pnpm test
```

## Options

```text
Usage:
  failure-packager [options] -- <command> [args...]
  failure-packager [options] --log <file>

Options:
  --log <file>             Read an existing log file instead of running a command.
  --output <file>          Write Markdown report. Defaults to failure-report.md.
  --json <file>            Write machine-readable JSON report.
  --max-log-chars <n>      Maximum sanitized log characters included in reports. Defaults to 60000.
  --include-full-log       Include the sanitized full captured log, capped for safety.
  --report-only            Always exit 0 after writing reports.
  --cwd <path>             Working directory used for command execution and environment context.
  --help                   Show help.
  --version                Show version.
```

By default, command output is mirrored to the terminal while it is captured. The final process exit code matches the wrapped command unless `--report-only` is set. Log ingest mode never runs a command.

## Framework Detection

`failure-packager` detects likely failures from both the command and output:

- Vitest
- Jest
- pytest
- Playwright
- Go test
- Cargo test
- Generic npm, pnpm, yarn, bun, or Node commands

When no framework is clear, the report still includes generic failure blocks, stack traces, assertions, file references, summaries, and a trimmed sanitized log excerpt.

## Example Report

````md
# Failure Report

Generated: 2026-06-01T05:00:00.000Z

## Status

| Field | Value |
| --- | --- |
| Mode | run |
| Framework | Vitest |
| Command | `npm test` |
| Exit code | 1 |
| Duration | 2.13s |

## Failure Summary

- `AssertionError: expected 2 to equal 3`
- `test/math.test.ts:7:20`

## Failure Details

### Block 1

```text
FAIL  test/math.test.ts > adds numbers
AssertionError: expected 2 to equal 3
  at test/math.test.ts:7:20
```
````

## GitHub Actions

Use the reusable action when you want report upload defaults without repeating the install, run, and artifact steps:

```yaml
jobs:
  npm-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - uses: michaelko/failure-packager@main
        with:
          command: npm test
```

The action installs `failure-packager` from the checked-out action ref by default, so pinned action versions run the matching CLI code. The `command` input is executed as one shell command through `failure-packager`, including shell operators such as `&&`.

For pytest projects, keep your Python setup steps and wrap the test command:

```yaml
jobs:
  pytest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-python@v6
        with:
          python-version: "3.12"
      - run: python -m pip install -r requirements.txt
      - uses: michaelko/failure-packager@main
        with:
          command: pytest
          artifact-name: pytest-failure-report
```

By default, the action fails with the wrapped command while still uploading `failure-report.md` and `failure-report.json`. Set `report-only: "true"` when you want CI to stay green and consume the report in a later step:

```yaml
- uses: michaelko/failure-packager@main
  with:
    command: npm test
    report-only: "true"
```

The manual workflow shape is still useful when you need full control:

```yaml
name: test

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx failure-packager --output failure-report.md --json failure-report.json -- npm test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: failure-report
          path: |
            failure-report.md
            failure-report.json
```

For manual jobs that should continue after tests fail, use `--report-only` and inspect the JSON report in a later step.

## JSON Output

The JSON report contains:

- `mode`, `command`, `cwd`, `exitCode`, and `durationMs`
- detected `framework`
- extracted `failures` with blocks, assertions, stacks, file references, and summary lines
- Playwright-style artifact references for traces, screenshots, and videos when they appear in logs
- sanitized `environment` context including platform, Node/npm versions, package manager, git branch, git SHA, git status summary, and changed files
- sanitized log text, truncated according to `--max-log-chars` unless `--include-full-log` is set

## Privacy and Safety

Reports are intentionally compact. ANSI control sequences are removed, common secret shapes are redacted, and logs are capped to avoid accidentally producing huge artifacts. Review generated reports before sharing them outside your organization.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests are welcome.

## License

MIT
