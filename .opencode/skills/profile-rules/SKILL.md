---
name: profile-rules
description: Rules for the kairosci profile generator: ultrastrict TypeScript, zod schemas, YAML data, external SVG templates
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  area: profile-generator
---

# Profile rules

Hard rules for every change in this repo. Verify each one before finishing.

## TypeScript is ultrastrict

- `tsconfig.json` stays at maximum strictness: `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`,
  `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
  `noImplicitOverride`, `verbatimModuleSyntax`.
- No `type` or `interface` keyword anywhere in `src/`. Shapes live in `src/schemas.ts`
  as zod schemas; use `z.infer<typeof xSchema>` inline where an annotation is needed.
- No `!`, no `as` casts, no `?.`, no `??`. Every possibly-missing value goes through
  `need`, `first` or `last` from `src/defined.ts`, which throw a named error instead.
- No `Object` index tricks, no `Record` declarations for data shapes. Dynamic maps are
  `z.record(...)` schemas or plain inferred values.
- No comments in `src/`. `//` and `/* */` appear only inside content strings
  (SVG text, counters), never as code comments.

## Zod validates every boundary

- `config/*.yml`, `data/*.json`, every GitHub REST and GraphQL response is parsed with
  `schema.parse`. A mismatch must throw, never silently produce `undefined`.
- `graphql()` takes the response schema as a parameter. No `as` on `res.json()`.
- New external field: new schema or schema extension first, code second.

## Data lives in YAML, markup lives in templates

- `config/profile.yml`: identity, links, sky position, `memberSince`, `extraLogins`,
  limits and the whole `tuning` block. `config/themes.yml`: full palettes.
- Nothing user-visible is hardcoded in `.ts` files. Thresholds, windows, counts and
  labels come from YAML or are computed from fetched data.
- `templates/` holds every SVG/HTML element with `{{var}}` placeholders, organized by
  area (`console`, `frame`, `stats`, `trending`, `city`, `sky`, `cards`, `readme`).
  `.ts` files compute numbers, path data and escaped text only, never tags.
  `render()` throws on missing templates, missing vars and unresolved placeholders,
  and trims trailing newlines so joined rows keep no stray whitespace.

## Content rules

- Projects are upstream repos where the login has at least one commit, ranked by
  commits desc, then PRs desc, then stars. Skip forks, archived, private, missing
  descriptions and the logins' own repos. `tuning.minCommits` and `tuning.minStars`
  drop the long tail; no repo is ever excluded by name. Tagline shows the computed counts.
- Tiles and bars show computed values only: upstream stars across N repos, languages
  weighted by commits on contributed repos, author-scoped issue/PR counts.
- Login is always lowercase. The full name is capitalized (`Alessio Attilio`), never
  full uppercase. No `.toUpperCase()` on identity strings.
- Card pairs are mirrored: left card chamfers top-right + bottom-left, right card
  chamfers top-left + bottom-right. Font sizes are computed from the text width.
  Button rows after the cards are framed on both sides (`framed: true`).
  Card titles are fitted against the star block width so they never collide.
- Palettes must be original (current: `reef`, `orchid`). Nothing that looks copied.
- No slop: no filler cells, no empty descriptions, no decorative zeros, sections with
  no data are skipped, not rendered empty.
- Legacy logins from `extraLogins` are fetched best-effort and merged into the
  calendar and totals; unreachable ones warn and skip. `memberSince` is the source of
  truth for the member-since row.
- Commits made with addresses GitHub does not attribute to the login are tracked:
  `extraEmails` plus addresses discovered from push events and `author-name` commit
  search. Only unattributed addresses are counted (linked ones are already covered),
  so link every address on github.com/settings/emails when possible: it fixes
  counts, calendar and streak retroactively with no code involved.

## Verify every change

- `npx tsc --noEmit` clean.
- `mise run check` green, plus a manual `fetch` + `render` (both themes) when data
  or templates change. All `assets/**/*.svg` must XML-parse with no `{{` leftovers.
- Grep the bans: `type`/`interface` keywords, ` as `, `?.`, `??`, HTML tags in `.ts`.
- Commit messages are exactly one line.
