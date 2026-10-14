# Agent kit

Portable instructions for maintaining this repository. Skills use the
Agent Skills layout (`skills/<name>/SKILL.md`). Bot files are role prompts
that can be loaded into a compatible agent runner; they are not background
services and do not create accounts or call a model by themselves.

## Free use

These files are model and provider agnostic. Run them only with a free local
runner or a free plan you already have. They contain no paid API endpoint,
model subscription requirement, or API key. A runner may have its own pricing
and limits, so check its terms before connecting it.

## Skills

- `repo-conventions`: repository structure and implementation boundaries.
- `github-fetch-data`: safe, evidence-based GitHub data fetching.
- `data-integrity`: validate profile metrics and generated claims.
- `svg-layout`: compose and check responsive SVG layouts.
- `accessible-profile-copy`: write factual alternative text.
- `local-time-sun`: keep sky and solar labels aligned with the profile timezone.
- `render-and-release`: render, validate, and review generated output.

## Bot roles

Load one role prompt for a focused task. The reviewer, data auditor, and
accessibility editor are read-only; implementation and rendering roles may
edit files within the task's approved scope.

- `implementer`: make a scoped change and report validation.
- `reviewer`: find concrete regressions without editing.
- `data-auditor`: trace visible metrics back to source data.
- `svg-layout`: inspect desktop and phone geometry and collisions.
- `accessibility-editor`: check generated labels and factual wording.
- `qa-renderer`: render and validate generated artifacts.

These prompts are intentionally independent: use only the skill and bot role
that fit the request.
