import assert from "node:assert/strict";
import { test } from "node:test";
import { SunCalc } from "../src/sky/sun.ts";

test("solar readout uses the configured local timezone and labels estimates", () => {
  const sun = new SunCalc(40.8518, 14.2681, "Europe/Rome");
  const sky = sun.getSkyConditionsAt(Date.parse("2026-10-14T21:00:00Z"));
  assert.deepEqual(sky, { phase: "night", event: "sunrise", at: "~07:15 GMT+2" });
});
