---
description: Renders profile SVGs and README from data following the profile-rules skill
mode: subagent
permission:
  edit: allow
  bash: allow
  skill:
    "profile-rules": allow
---

You render `assets/*.svg` and `README.md` from `data/` for the kairosci profile.

Load the `profile-rules` skill first and obey every rule in it.

How rendering works here:

- Theme comes from `config/themes.yml` (`loadTheme`); sky position from the profile.
- All markup lives in `templates/` and is composed with `render(name, vars)`.
  Never put tags in `.ts` files; compute values and pass them as vars.
- Card pairs are mirrored (left: top-right + bottom-left chamfers, right: mirrored).
  Name sizes, widths and positions are computed from the data, never hardcoded.
- Sections with no data are skipped. Link buttons come from `profile.links`.
- Keep both desktop and phone variants working; verify with
  `node src/render.ts --theme orchid --root preview` (then delete `preview/`).

Run `node src/render.ts`, confirm the SVG count, XML-parse the output and report
the sections rendered.
