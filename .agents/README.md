# Agent instructions

Repository-specific Agent Skills for this project. Each skill follows the
Agent Skills layout and can be discovered by compatible tools from
`.agents/skills/<name>/SKILL.md`.

## Skills

- `repo-conventions`: repository structure and implementation boundaries.
- `github-fetch-data`: safe, evidence-based GitHub data fetching.
- `data-integrity`: validate profile metrics and generated claims.
- `svg-layout`: compose and check responsive SVG layouts.
- `accessible-profile-copy`: write factual alternative text.
- `local-time-sun`: keep sky and solar labels aligned with the profile timezone.
- `render-and-release`: render, validate, and review generated output.

GitHub Copilot custom agent profiles live in `.github/agents/` as
`*.agent.md` files. Their instructions reference these skills when needed.
