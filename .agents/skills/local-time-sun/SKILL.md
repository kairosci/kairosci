---
name: local-time-sun
description: Use when changing local clock labels, daylight phases, sunrise or sunset calculations, or timezone handling.
---

# Local time and sun phases

The profile's IANA timezone, latitude, and longitude live in
`config/profile.yml`. `RenderContext` passes them to `src/sky/sun.ts`.

- Use the configured IANA timezone for calendar-day selection and formatting;
  do not rely on the machine's local timezone.
- Account for daylight-saving transitions and the case where the next solar
  event falls on the next local date.
- Solar times from the in-repository calculation are estimates. Preserve an
  approximation marker and sensible precision in visible labels.
- Use `PROFILE_NOW` to make time-dependent behavior reproducible in tests.
- Check representative timestamps before sunrise, during day, near sunset, and
  after midnight in the configured timezone.
