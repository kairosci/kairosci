import { z } from "zod";
import { SunCalc } from "./sky/sun.ts";
import { Slices } from "./console.ts";
import { profileSchema, snapshotSchema, themesFileSchema } from "./schemas.ts";
import { TemplateEngine } from "./templates.ts";

export class RenderContext {
  readonly engine: TemplateEngine;
  readonly theme: z.infer<typeof themesFileSchema>["themes"][number];
  readonly snapshot: z.infer<typeof snapshotSchema>;
  readonly profile: z.infer<typeof profileSchema>;
  readonly slices: Slices;
  readonly sun: SunCalc;

  constructor(
    engine: TemplateEngine,
    theme: z.infer<typeof themesFileSchema>["themes"][number],
    snapshot: z.infer<typeof snapshotSchema>,
    profile: z.infer<typeof profileSchema>,
  ) {
    this.engine = engine;
    this.theme = theme;
    this.snapshot = snapshot;
    this.profile = profile;
    this.slices = new Slices(engine, theme);
    this.sun = new SunCalc(profile.lat, profile.lon, profile.tz);
  }
}
