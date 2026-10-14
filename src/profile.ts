import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { profileSchema, themesFileSchema } from "./schemas.ts";

export async function loadProfile(): Promise<z.infer<typeof profileSchema>> {
  const profile = profileSchema.parse(parseYaml(await readFile("config/profile.yml", "utf8")));
  if (Number.isNaN(Date.parse(profile.memberSince))) throw new Error(`memberSince is not a date: ${profile.memberSince}`);
  return profile;
}

export async function loadTheme(name: string): Promise<z.infer<typeof themesFileSchema>["themes"][number]> {
  const file = themesFileSchema.parse(parseYaml(await readFile("config/themes.yml", "utf8")));
  for (const theme of file.themes) {
    if (theme.name.toLowerCase() === name.toLowerCase()) return theme;
  }
  throw new Error(`missing theme ${name}`);
}
