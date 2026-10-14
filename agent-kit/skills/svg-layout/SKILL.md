---
name: svg-layout
description: Use when editing SVG templates, typography, card geometry, icons, or desktop and phone layouts.
---

# SVG layout

Treat each generated SVG as a measured layout. Check the actual rendered
coordinates for text, icons, and card boundaries.

- Keep markup in `templates/` and layout calculations in the matching
  `src/sections/` module or `src/layout.ts`.
- Use the project font metrics and fitted text helpers. Reserve explicit space
  for icons, arrows, and neighboring labels; include the glyph's measured width.
- Check both `DESKTOP` and `PHONE`, short and long content, and each supported
  column count. Verify vertical as well as horizontal separation.
- Inspect clipping, chamfers, anchors, baselines, stroke bounds, and SVG viewBox
  edges. A text bounding box check alone does not detect icon collisions.
- Render representative output and XML-parse changed SVGs; ensure no unresolved
  template placeholders remain.
