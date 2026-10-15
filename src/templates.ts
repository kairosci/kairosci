import { readdir, readFile } from "node:fs/promises";
import { z } from "zod";
import { need } from "./defined.ts";
import { themesFileSchema } from "./schemas.ts";

async function collectTemplateFilePaths(dir: string, files: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectTemplateFilePaths(path, files);
    } else if (entry.name.endsWith(".svg") || entry.name.endsWith(".html") || entry.name.endsWith(".css")) {
      files.push(path);
    }
  }
}

export class TemplateEngine {
  private templates = new Map<string, string>();

  async load(root: string): Promise<void> {
    this.templates.clear();
    const files: string[] = [];
    await collectTemplateFilePaths(root, files);
    for (const file of files) {
      const name = file.slice(root.length + 1, file.lastIndexOf("."));
      this.templates.set(name, await readFile(file, "utf8"));
    }
  }

  render(name: string, vars: Record<string, string | number>): string {
    const tpl = need(this.templates.get(name), `template ${name}`);
    const out = tpl.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_whole: string, key: string) => {
      return String(need(vars[key], `var ${key} in template ${name}`));
    });
    const leftover = out.match(/\{\{[a-zA-Z0-9_]+\}\}/);
    if (leftover !== null) throw new Error(`unresolved placeholder ${need(leftover[0], "placeholder")} in ${name}`);
    return out.replace(/\n+$/, "");
  }
}

export function createThemeSvgVariables(theme: z.infer<typeof themesFileSchema>["themes"][number]): Record<string, string> {
  return {
    accent: theme.accent,
    accent2: theme.accent2,
    ok: theme.ok,
    bg: theme.bg,
    fg: theme.fg,
    dim: theme.dim,
    faint: theme.faint,
    fainter: theme.fainter,
    bright: theme.bright,
    star: theme.star,
    well: theme.well,
    moon: theme.moon,
    cityLeft: theme.city.left,
    cityRight: theme.city.right,
    cityEmpty: theme.city.empty,
    cityEmptyStroke: theme.city.emptyStroke,
    cityWinOn: theme.city.winOn,
    cityWinSide: theme.city.winSide,
    cityWinOff: theme.city.winOff,
    citySky: theme.city.sky,
  };
}
