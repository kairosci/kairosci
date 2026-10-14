import { readFile } from "node:fs/promises";
import { z } from "zod";
import { DESKTOP, PHONE, esc } from "../console.ts";
import { RenderContext } from "../ctx.ts";
import { geoSchema, projectSchema } from "../schemas.ts";
import { themeVars } from "../templates.ts";

import { cardLayout, clampText, fitText, fontMetrics, textWidth } from "../layout.ts";

export const CARD_H = 200;

export async function logoHref(p: z.infer<typeof projectSchema>): Promise<string | null> {
  if (p.logo === "") return null;
  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const svgLogo = await readFile(`data/logos/${slug}.svg`, "utf8").catch(() => null);
  if (svgLogo !== null) {
    const dark = svgLogo
      .replace(/@media\s*\(prefers-color-scheme:\s*dark\)/g, "@media all")
      .replace(/@media\s*\(prefers-color-scheme:\s*light\)/g, "@media not all");
    return `data:image/svg+xml;base64,${Buffer.from(dark).toString("base64")}`;
  }
  const png = await readFile(`data/logos/${slug}.png`).catch(() => null);
  if (png === null) return null;
  return `data:image/png;base64,${png.toString("base64")}`;
}

export class ProjectsSection {
  private ctx: RenderContext;

  constructor(ctx: RenderContext) { this.ctx = ctx; }

  card(p: z.infer<typeof projectSchema>, side: "L" | "R", delay: number): Promise<string> {
    return this.renderCard(p, DESKTOP, side, delay);
  }

  phoneCard(p: z.infer<typeof projectSchema>, side: "L" | "R", delay: number): Promise<string> {
    return this.renderCard(p, PHONE, side, delay);
  }

  private async renderCard(p: z.infer<typeof projectSchema>, g: z.infer<typeof geoSchema>, side: "L" | "R", delay: number): Promise<string> {
    const { engine, theme, slices } = this.ctx;
    const card = cardLayout(g, side === "L" ? 0 : 1, 2, CARD_H);
    const tx = card.left;
    const sx = card.right;
    const inner = sx - tx;
    const nameSize = g.narrow ? 15 : 17;
    const bodySize = 12;
    const leading = bodySize * 1.5;
    const logo = await logoHref(p);
    const logoSize = 18;
    const nx = tx + (logo === null ? 0 : logoSize + card.padding / 2);
    const nameY = card.top + nameSize * fontMetrics.capitals;
    const name = fitText(p.name, sx - nx - logoSize, nameSize);
    const nameWidth = textWidth(name, nameSize);
    const tagY = nameY + card.padding;
    const tagTY = tagY + 12;
    const stars = fitText(p.stars, inner / 3, bodySize);
    const starWidth = textWidth(stars, bodySize) + logoSize;
    const tagPadding = card.padding / 2;
    const fullTag = g.narrow || p.tagline === "" ? p.kind : `${p.kind} · ${p.tagline}`;
    const tag = fitText(fullTag, inner - starWidth - card.padding - tagPadding * 2, 11, 1);
    const tagW = textWidth(tag, 11, 1) + tagPadding * 2;
    const cmdRows = Math.max(1, Math.floor((card.height / 4) / leading));
    const cmd = clampText(p.install, inner - textWidth("$ ", bodySize), bodySize, cmdRows);
    const installY = card.bottom - bodySize * fontMetrics.descent - (cmd.length - 1) * leading;
    const descY = tagY + 16 + card.padding + bodySize * fontMetrics.capitals;
    const descRows = Math.max(0, Math.floor((installY - leading - descY) / leading) + 1);
    const desc = clampText(p.description, inner, bodySize, descRows);
    const install = cmd.map((text, i) => engine.render(i === 0 ? "cards/pcard-inst0" : "cards/pcard-inst1", {
      tx: i === 0 ? tx : tx + textWidth("$ ", bodySize), y: installY + i * leading, cmd: esc(text),
    })).join("\n");
    const content = engine.render("cards/project", {
      ...themeVars(theme), tx, sx, nx, nameSize, nameY, name: esc(name),
      logoX: tx, logoY: card.top, logoImg: logo === null ? "" : engine.render("cards/logo-img", { href: logo }),
      arrowX: nx + nameWidth + card.padding / 3, arrowY: nameY - 2,
      arrowX2: nx + nameWidth + card.padding / 3 + 2, arrowY2: nameY - 9,
      tagY, tagTY, tagTX: tx + tagPadding, tagW, tag: esc(tag),
      tagc: /cli$/i.test(p.kind) ? theme.ok : theme.accent2,
      starX: sx - textWidth(stars, bodySize) - logoSize, starY: tagY + 1, stars: esc(stars),
      desc: desc.map((text, i) => engine.render("cards/pcard-desc", { tx, y: descY + i * leading, text: esc(text) })).join("\n"),
      install,
    });
    const body = engine.render("cards/shell", { ...themeVars(theme), ...card, content, delay });
    const defs = side === "R" ? slices.baseDefs(((-g.HW % 40) + 40) % 40) : slices.baseDefs();
    return slices.halfSliceG(g, CARD_H, side, body, {
      title: p.name, desc: `${p.name}: ${p.description} Install: ${p.install}. ${p.stars} stars.`,
      text: name + tag + desc.join("") + `$ ${cmd.join("")}` + stars, defs,
    });
  }
}
