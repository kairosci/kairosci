import { siGithub } from "simple-icons";
import { z } from "zod";
import { DESKTOP, FL, FR, M, PHONE, X, esc, f1 } from "../console.ts";
import { RenderContext } from "../ctx.ts";
import { need } from "../defined.ts";
import { buttonSchema, geoSchema } from "../schemas.ts";
import { themeVars } from "../templates.ts";
import { cardLayout, fitText, fontMetrics, nameLayout, textWidth, wrapText } from "../layout.ts";


export class HeaderSection {
  private ctx: RenderContext;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
  }


  alt(): string {
    const s = this.ctx.snapshot;
    const profile = this.ctx.profile;
    return `${profile.displayName} (@${profile.login}). ${s.intro} Top repos: ${s.projects
      .slice(0, profile.tuning.headerTools)
      .map((p) => p.name)
      .join(", ")}.`;
  }

  async header(): Promise<string> {
    const { engine, theme, profile } = this.ctx;
    const slices = this.ctx.slices;
    const barLeft = `sys://${profile.siteHost} // node:${profile.login}`;
    const barRight = "ONLINE · ALL SYSTEMS NOMINAL";
    const bio = this.ctx.snapshot.intro === "" ? profile.displayName : this.ctx.snapshot.intro;
    const name = profile.headerName.toUpperCase();
    const nameTop = 102 + 15 * fontMetrics.ascent;
    const nameWidthSize = (DESKTOP.R - X - 2 * DESKTOP.M * fontMetrics.advance) /
      (Array.from(name).length * (fontMetrics.advance + fontMetrics.advance / 25));
    const nameBox = nameLayout(name, DESKTOP.R - X, nameTop, nameTop + nameWidthSize * (fontMetrics.capitals + fontMetrics.descent), DESKTOP.M * fontMetrics.advance);
    const bioLines = wrapText(bio, DESKTOP.R - X - textWidth(">> ", 15), 15);
    const firstRow = engine.render("frame/header-line", { x: X, text: esc(need(bioLines[0], "GitHub description")) });
    const continuationRows = bioLines.slice(1).map((line) => engine.render("frame/header-continuation", { x: X + textWidth(">> ", 15), text: esc(line) }));
    const bioRows = [firstRow, ...continuationRows];
    const bioTop = Math.ceil(nameBox.baseline + nameBox.size * fontMetrics.descent + 15 * fontMetrics.ascent);
    const bioLineHeight = 15 * fontMetrics.ascent;
    const h = Math.ceil((bioTop + (bioRows.length - 1) * bioLineHeight + 15 * fontMetrics.descent + DESKTOP.M * fontMetrics.advance) / 40) * 40;
    const defs = engine.render("frame/defs-header", { x: X, clipY: 80 });
    const barLX = FL + DESKTOP.M;
    const barRX = FR - DESKTOP.M;
    const dotx = barRX - textWidth(barRight, 12, 1) - DESKTOP.M;
    const descLines = need(slices.stagger(bioRows, bioTop, bioLineHeight, 1.75, 0.12)[0], "GitHub description lines");
    const body = engine.render("frame/header-top", {
      ...themeVars(theme),
      fl: FL,
      fr: FR,
      m: M,
      barW: FR - FL,
      barY: M + 34,
      barLX,
      barLY: M + 22,
      barRX,
      barLeft: esc(fitText(barLeft, dotx - barLX - (barLX - FL), 12, 1)),
      barRight: esc(barRight),
      dotx: f1(dotx),
      dotY: M + 18,
      x: X,
      whoY: 102,
      nameSize: nameBox.size,
      nameSpacing: nameBox.spacing,
      nameY: nameBox.baseline,
      gmX: X + DESKTOP.M * fontMetrics.advance / 2,
      gcX: X - DESKTOP.M * fontMetrics.advance / 2,
      name: esc(name),
      descLines,
      scanY: M + 35,
      scanH: h - M - 35,
    });
    return slices.sliceG(DESKTOP, h, body, {
        title: profile.displayName,
        desc: this.alt(),
        text: barLeft + barRight + name + "$ whoami>>" + bio,
        top: true,
        css: this.ctx.engine.render("css/header", {}),
        defs,
        weights: [400, 700, 800],
      });
  }

  async phoneHeader(): Promise<string> {
    const { engine, theme, snapshot, profile } = this.ctx;
    const slices = this.ctx.slices;
    const g = PHONE;
    const barLeft = `sys://${profile.siteHost} // ${profile.login}`;
    const barRight = "ONLINE · NOMINAL";
    const bio = snapshot.intro === "" ? profile.displayName : snapshot.intro;
    const name = profile.headerName.toUpperCase();
    const defs = engine.render("frame/defs-header", { x: g.X, clipY: 64 });
    const barLX = g.FL + g.M;
    const barRX = g.FR - g.M;
    const dotx = barRX - textWidth(barRight, 12, 1) - g.M;
    const nameTop = 86 + 15 * fontMetrics.ascent;
    const nameWidthSize = (g.R - g.X - 2 * g.M * fontMetrics.advance) /
      (Array.from(name).length * (fontMetrics.advance + fontMetrics.advance / 25));
    const nameBox = nameLayout(name, g.R - g.X, nameTop, nameTop + nameWidthSize * (fontMetrics.capitals + fontMetrics.descent), g.M * fontMetrics.advance);
    const bioLines = wrapText(bio, g.R - g.X - textWidth(">> ", 15), 15);
    const firstRow = engine.render("frame/header-line", { x: g.X, text: esc(need(bioLines[0], "GitHub description")) });
    const continuationRows = bioLines.slice(1).map((line) => engine.render("frame/header-continuation", { x: g.X + textWidth(">> ", 15), text: esc(line) }));
    const bioRows = [firstRow, ...continuationRows];
    const bioTop = Math.ceil(nameBox.baseline + nameBox.size * fontMetrics.descent + 15 * fontMetrics.ascent);
    const bioLineHeight = 15 * fontMetrics.ascent;
    const h = Math.ceil((bioTop + (bioRows.length - 1) * bioLineHeight + 15 * fontMetrics.descent + g.M * fontMetrics.advance) / 40) * 40;
    const step = 0.12;
    const descLines = slices.stagger(bioRows, bioTop, bioLineHeight, 1.75, step)[0];
    const body = engine.render("frame/header-top", {
      ...themeVars(theme),
      fl: g.FL,
      fr: g.FR,
      m: g.M,
      barW: g.FR - g.FL,
      barY: g.M + 34,
      barLX,
      barLY: g.M + 22,
      barRX,
      barLeft: esc(fitText(barLeft, dotx - barLX - g.M, 12, 1)),
      barRight: esc(barRight),
      dotx: f1(dotx),
      dotY: g.M + 18,
      x: g.X,
      whoY: 86,
      nameSize: nameBox.size,
      nameSpacing: nameBox.spacing,
      nameY: nameBox.baseline,
      gmX: g.X + g.M * fontMetrics.advance / 2,
      gcX: g.X - g.M * fontMetrics.advance / 2,
      name: esc(name),
      descLines: need(descLines, "phone GitHub description lines"),
      scanY: g.M + 35,
      scanH: h - g.M - 35,
    });
    return slices.sliceG(g, h, body, {
        title: profile.displayName,
        desc: this.alt(),
        text: barLeft + barRight + name + "$ whoami>>" + bio,
        top: true,
        css: this.ctx.engine.render("css/header", {}),
        defs,
        weights: [400, 700, 800],
      });
  }

  async footer(): Promise<string> {
    const { engine, profile } = this.ctx;
    const body = engine.render("frame/footer", {
      x: X,
      login: profile.login,
      endX: FR - 36,
    });
    return this.ctx.slices.sliceG(DESKTOP, 80, body, {
      title: "End of profile",
      desc: "Connection closed.",
      text: `$ exit connection to ${profile.login} closed. // EOF`,
      bottom: true,
    });
  }

  async phoneFooter(): Promise<string> {
    const { engine, profile } = this.ctx;
    const g = PHONE;
    const body = engine.render("frame/phone-footer", {
      x: g.X,
      r: g.R,
      login: profile.login,
    });
    return this.ctx.slices.sliceG(g, 120, body, {
      title: "End of profile",
      desc: "Connection closed.",
      text: `$ exit connection to ${profile.login} closed. // EOF`,
      bottom: true,
    });
  }
}

export class Buttons {
  private ctx: RenderContext;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
  }

  private iconFor(kind: string): string {
    const theme = this.ctx.theme;
    if (kind === "github") return this.ctx.engine.render("frame/icon-github", { ...themeVars(theme), d: siGithub.path });
    if (kind === "website") return this.ctx.engine.render("frame/icon-website", { ...themeVars(theme) });
    throw new Error(`missing icon ${kind}`);
  }

  linkButtons(): z.infer<typeof buttonSchema>[] {
    const profile = this.ctx.profile;
    return profile.links.map((link) => ({
      label: link.label,
      handle: link.handle,
      url: link.url,
      icon: this.iconFor(link.icon),
    }));
  }

  button(b: z.infer<typeof buttonSchema>, k: number, n: number, delay0 = 0.25, framed = false): Promise<string> {
    return this.renderButton(b, DESKTOP, k, n, delay0, framed);
  }

  phoneButton(b: z.infer<typeof buttonSchema>, k: number, n: number, delay0 = 0.25, framed = false): Promise<string> {
    return this.renderButton(b, PHONE, k, n, delay0, framed);
  }

  private async renderButton(b: z.infer<typeof buttonSchema>, g: z.infer<typeof geoSchema>, k: number, n: number, delay0: number, framed: boolean): Promise<string> {
    const { engine, theme, slices } = this.ctx;
    const height = 80;
    const card = cardLayout(g, k, n, height);
    const iconSize = 18;
    const centered = g.narrow;
    const labelSize = centered ? 12 : 13;
    const labelX = centered ? card.x + card.width / 2 : card.left + iconSize + card.padding / 2;
    const labelWidth = centered ? card.right - card.left : card.right - labelX;
    const label = fitText(b.label, labelWidth, labelSize);
    const handle = fitText(b.handle, centered ? card.right - card.left : labelWidth, 10);
    const content = engine.render("cards/link", {
      ...themeVars(theme), icon: b.icon,
      iconX: centered ? card.x + (card.width - iconSize) / 2 : card.left,
      iconY: card.top,
      labelX, labelY: centered ? card.bottom - labelSize * fontMetrics.descent : card.top + labelSize * fontMetrics.capitals,
      labelSize, label: esc(label), anchor: centered ? "middle" : "start",
      handle: centered ? "" : engine.render("cards/link-handle", { x: labelX, y: card.bottom - 10 * fontMetrics.descent, text: esc(handle) }),
    });
    const body = engine.render("cards/shell", { ...themeVars(theme), ...card, content, delay: delay0 + k * 0.08 });
    return slices.segmentG(g, k, n, height, body, { title: b.label, desc: `${b.label}: ${b.url}`, text: label + handle + ">_" }, framed);
  }
}
