---
name: data-integrity
description: Use when checking whether profile statistics, dates, rankings, and generated claims match their source data.
---

# Data integrity

For every visible number or factual claim, identify its source and recompute the
same period and aggregation used by the renderer.

- Follow values from `data/*.json` through section calculations into SVG or
  README output. Distinguish raw API values from merged profile totals.
- Verify inclusive date bounds, rolling-window length, timezone, sorting, and
  tie behavior. Make the plotted range and displayed total use the same days.
- Keep missing, zero, estimated, and unavailable values distinct. Do not turn
  missing data into zero or present an estimate as exact.
- Check that labels describe the calculation actually shown, including units
  and periods. Prefer traceable facts over decorative claims.
- Add or update a focused test for a corrected calculation when practical.
