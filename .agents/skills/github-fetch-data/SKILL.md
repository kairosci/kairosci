---
name: github-fetch-data
description: Use when changing how the profile fetches, merges, validates, or stores GitHub data.
---

# GitHub data fetching

Trace each displayed value from GitHub response through parsing and aggregation
to the snapshot or calendar that the renderer consumes.

- Validate external responses at the boundary with the relevant Zod schema in
  `src/schemas.ts`; handle missing or changed fields explicitly.
- Preserve the last known good data when the existing fetch flow specifies a
  fallback. Never replace unavailable data with guessed values.
- Keep contribution, commit, pull request, issue, and star counts distinct.
  Check login and repository attribution before aggregating.
- Read `config/profile.yml` for profile identity, extra logins, limits, and
  tuning; do not duplicate those values in code.
- Fetching can use network access and update `data/`. Run it only when the task
  calls for fresh data and the required credentials are available.
- Report which source data changed and which displayed metrics were affected.
