# Contribution City roadmap

The city remains a vector scene so it scales cleanly across screen widths and
pixel densities. Desktop and phone SVGs use separate layouts; the browser can
scale either output without raster blur.

## Sprint 1 — Depth and resolution review

**Status: implemented.** Added atmospheric haze, distance-based building
contrast, and kept lighting motion tied to the existing reduced-motion
preference. Fixed the missing star-template reference that caused night renders
to fail. Rasterized the desktop scene at 320, 360, 390, 440, 640, 768, 880,
1024, 1280, 1440, and 1920 CSS pixels, and the phone scene at 320, 375, and
440 pixels. Visually reviewed representative small, default, and wide outputs.

Acceptance: both SVG layouts parse as XML, scale without clipping, preserve the
ascending city silhouette, and remain readable at their intended display size.

## Sprint 2 — Streets and urban blocks

**Status: implemented.** Added paved block tiles under the city and narrowed
building footprints to expose consistent street gaps. Zero-contribution days
remain visibly empty lots with their original legend color.

Acceptance: streets clarify the isometric grid without obscuring buildings,
windows, or the contribution legend.

## Sprint 3 — Architecture and local detail

**Status: implemented.** Building widths, window columns, and rooftop equipment
profiles now vary from a deterministic seed derived from each calendar cell.
The same contribution data always produces the same architecture.

Acceptance: the scene has recognizable building silhouettes at phone scale,
and identical source data always renders the same city.

## Sprint 4 — Motion and performance

**Status: implemented; renderer compatibility remains open.** Added a small set
of phase-aware, animated streetlights to empty lots. Only lit windows and
tall-building beacons now animate; dark windows and short rooftop units have
no animation work. The SVG honors reduced-motion preferences. Remaining work:
check animated SVG behavior in common Markdown renderers.

Acceptance: motion is subtle, `prefers-reduced-motion` disables it, and both
SVGs remain suitable for a GitHub profile README.

## Sprint 5 — Phase and viewport sign-off

**Status: verified locally.** Reviewed dawn, day, dusk, and night on desktop and
phone layouts. Rendered the desktop SVG at 11 widths from 320 to 1920 pixels,
and the phone SVG at 320, 375, and 440 pixels. Both outputs parse as XML and
contain no unresolved placeholders or invalid numeric values.

Acceptance: labels and scene details remain distinct in every sky phase, and
the final alt text describes the data rather than the decoration.

## Sprint 6 — GitHub renderer compatibility

Compare CSS animation and embedded-font behavior in GitHub profile previews
with the local SVG renderer. Document any platform limits and keep static
fallback details legible when a viewer does not animate SVG content.

Acceptance: the city remains complete and understandable when animation or
embedded fonts are unavailable.
