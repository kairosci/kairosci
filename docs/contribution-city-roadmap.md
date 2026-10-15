# Contribution City roadmap

The city remains a vector scene so it scales cleanly across screen widths and
pixel densities. Desktop and phone SVGs use separate layouts; the browser can
scale either output without raster blur.

## Sprint 1 — Depth and resolution review

**Status: implemented.** Added atmospheric haze, distance-based building
contrast, and kept lighting motion tied to the existing reduced-motion
preference. Fixed the missing star-template reference that caused night renders
to fail. Visually reviewed the desktop scene at 320, 360, 390, 440, 640, 768,
880, 1024, 1280, 1440, and 1920 CSS pixels, and the phone scene at 320, 375,
and 440 pixels.

Acceptance: both SVG layouts parse as XML, scale without clipping, preserve the
ascending city silhouette, and remain readable at their intended display size.

## Sprint 2 — Streets and urban blocks

Add a restrained street network, sidewalks, and block edges beneath the daily
buildings. Keep zero-contribution days visually distinct from active days, and
avoid adding decorative structures that could be mistaken for contribution
data.

Acceptance: streets clarify the isometric grid without obscuring buildings,
windows, or the contribution legend.

## Sprint 3 — Architecture and local detail

Vary roof profiles, façade rhythms, and rooftop equipment by deterministic
calendar-derived seeds. Add a small number of street-level details where the
available tile area can support them.

Acceptance: the scene has recognizable building silhouettes at phone scale,
and identical source data always renders the same city.

## Sprint 4 — Motion and performance

Tune window, cloud, sun, moon, aircraft, and beacon timing so motion reads as
one scene. Check animated SVG behavior in common Markdown renderers and reduce
unnecessary animated elements if the file becomes costly to display.

Acceptance: motion is subtle, `prefers-reduced-motion` disables it, and both
SVGs remain suitable for a GitHub profile README.

## Sprint 5 — Phase and viewport sign-off

Review dawn, day, dusk, and night with representative short and long labels.
Capture the desktop and phone outputs at the viewport widths listed in Sprint 1
and record any clipping, overlap, contrast, or animation regressions.

Acceptance: labels and scene details remain distinct in every sky phase, and
the final alt text describes the data rather than the decoration.
