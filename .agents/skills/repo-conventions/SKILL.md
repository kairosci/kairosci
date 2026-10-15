---
name: repo-conventions
description: Use when changing the Kairosci profile generator, its data flow, templates, or generated assets.
---

# Repository conventions

Keep changes consistent with the actual project structure and configuration.

- `src/schemas.ts` defines parsed data shapes; `src/profile.ts` loads profile
  and theme configuration from `config/`.
- `src/fetch.ts` and `src/fetch/` gather GitHub data. `src/render.ts` builds
  output from `data/`, `src/sections/`, and `templates/`.
- Keep SVG and HTML markup in `templates/`; pass escaped, computed values from
  TypeScript. Reuse `src/layout.ts` for text measurement and card geometry.
- Treat `data/` and `assets/` as generated inputs and outputs. Inspect their
  current state before regenerating, and preserve unrelated user changes.
- Read nearby code and tests before applying a convention. Do not carry forward
  stale rules from another tool configuration when current code contradicts them.
- Keep scope narrow. Describe any generated-data or visual changes and the
  checks that support them.
