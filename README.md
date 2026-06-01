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
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm install --no-save github:michaelko/failure-packager
      - run: npx failure-packager --output failure-report.md --json failure-report.json -- npm test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: failure-report
          path: |
            failure-report.md
            failure-report.json
```

For jobs that should continue after tests fail, use `--report-only` and inspect the JSON report in a later step.

## JSON Output

The JSON report contains:

- `mode`, `command`, `cwd`, `exitCode`, and `durationMs`
- detected `framework`
- extracted `failures` with blocks, assertions, stacks, file references, and summary lines
- sanitized `environment` context including platform, Node/npm versions, package manager, git branch, git SHA, git status summary, and changed files
- sanitized log text, truncated according to `--max-log-chars` unless `--include-full-log` is set

## Privacy and Safety

Reports are intentionally compact. ANSI control sequences are removed, common secret shapes are redacted, and logs are capped to avoid accidentally producing huge artifacts. Review generated reports before sharing them outside your organization.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests are welcome.

## License

MIT
