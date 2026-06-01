# Contributing

Thanks for improving `failure-packager`.

## Development

```sh
npm install
npm test
npm run build
```

The project is intentionally dependency-light. Runtime code should prefer Node standard library APIs unless a dependency materially improves correctness or maintainability.

## Pull Requests

- Keep changes focused and include tests for behavior changes.
- Update README examples when CLI behavior changes.
- Run `npm test` and `npm run build` before opening a pull request.
- Avoid committing generated reports, `dist/`, or dependency folders.

## Reporting Bugs

Include the command you ran, the framework involved, relevant redacted log excerpts, and the generated JSON report if available.

## Security

Do not paste secrets into public issues. Follow [SECURITY.md](SECURITY.md) for vulnerability reports.
