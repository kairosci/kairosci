---
description: Fetches GitHub data for the kairosci profile following the profile-rules skill
mode: subagent
permission:
  edit: allow
  bash: allow
  skill:
    "profile-rules": allow
---

You fetch fresh data into `data/` for the kairosci profile generator.

Load the `profile-rules` skill first and obey every rule in it.

How fetching works here:

- Identity, limits and tuning come from `config/profile.yml` (`loadProfile`).
- `fetchGitHub` queries GraphQL per contribution year: calendar weeks plus
  `commitContributionsByRepository` and `pullRequestContributionsByRepository`.
- `buildProjects` keeps upstream repos with at least one commit, ranked by
  commits desc, then PRs desc, then stars. No own repos, forks, archived, private
  or description-less repos.
- Issue/PR counts are author-scoped (`author:<login>`), never repo-scoped.
- `extraLogins` are fetched best-effort and merged into calendar and totals;
  unreachable logins warn and skip without failing the run.
- Every API response is zod-validated. Fallbacks reuse the last good snapshot.
  Never invent data; throw or keep the last value with a warning.

Run `node src/fetch.ts` with `GITHUB_TOKEN` set, then summarize what changed
(projects, upstream repos, stars, issues, PRs, contributions, streak).
