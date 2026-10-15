---
name: render-and-release
description: Use when generating or validating README and SVG output after source, data, or template changes.
---

# Render and validate output

Use the repository scripts and validate generated output against its source.

- Run `pnpm render` for local rendering. It writes `README.md` and `assets/`;
  inspect the working tree first and review every generated change afterward.
- Run `pnpm typecheck` and `pnpm test` for code changes. Use focused checks
  where available, then validate the complete generated output for rendering
  changes.
- Parse generated SVG as XML and check for unresolved `{{...}}`, `NaN`, or
  `Infinity` values.
- Do not run the network-backed fetch step unless fresh GitHub data is part of
  the requested task.
- Report which commands passed and note any generated artifacts that changed.
