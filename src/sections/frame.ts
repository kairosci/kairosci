import { siGithub } from "simple-icons";
import { z } from "zod";
import { DESKTOP, FL, FR, M, PHONE, X, esc, f1 } from "../console.ts";
import { RenderContext } from "../ctx.ts";
import { first, last, need } from "../defined.ts";
import { buttonSchema, geoSchema } from "../schemas.ts";
import { themeVars } from "../templates.ts";
import { cardLayout, fitText, fontMetrics, nameLayout, textWidth, wrapText } from "../layout.ts";

const ADV = fontMetrics.advance;
const SNAP = 1.04;

function pack(items: string[], cols: number): string[] {
  const lines: string[] = [];
  for (const item of items.flatMap((text) => wrapText(text, cols * textWidth("M", 15), 15))) {
    const prev = lines.length === 0 ? null : last(lines, "packed line");
    if (prev !== null && prev.length + 3 + item.length <= cols) {
      lines[lines.length - 1] = `${prev} · ${item}`;
    } else {
      lines.push(item);
    }
  }
  return lines;
}

export class HeaderSection {
  private ctx: RenderContext;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
  }

  private lines(): [string, string, string] {
    const s = this.ctx.snapshot;
    const profile = this.ctx.profile;
    const tools = s.projects
      .slice(0, profile.tuning.headerTools)
      .map((p) => p.name)
      .join(" · ");
    const introWords = wrapText(s.intro === "" ? profile.displayName : s.intro, DESKTOP.R - DESKTOP.X - textWidth(">> ", 15), 15);
    return [need(first(introWords, "intro line"), "intro line"), fitText(tools, DESKTOP.R - DESKTOP.X - textWidth(">> ", 15), 15), "personal site and profile at "];
  }

  alt(): string {
    const s = this.ctx.snapshot;
    const profile = this.ctx.profile;
    return `${profile.displayName} (@${profile.login}). ${s.intro} Top repos: ${s.projects
      .slice(0, profile.tuning.headerTools)
      .map((p) => p.name)
      .join(", ")}.`;
  }

  async header(): Promise<[string, string]> {
    const { engine, theme, profile } = this.ctx;
    const slices = this.ctx.slices;
    const barLeft = `sys://${profile.siteHost} // node:${profile.login}`;
    const barRight = "ONLINE · ALL SYSTEMS NOMINAL";
    const lines = this.lines();
    const h = 240;
    const name = profile.headerName.toUpperCase();
    const nameBox = nameLayout(name, DESKTOP.R - X, 102 + 15 * fontMetrics.ascent, h - 6 - 24 - 15 * fontMetrics.ascent, DESKTOP.M * fontMetrics.advance);
    const defs = engine.render("frame/defs-header", { x: X, clipY: 80 });
    const barLX = FL + DESKTOP.M;
    const barRX = FR - DESKTOP.M;
    const dotx = barRX - textWidth(barRight, 12, 1) - DESKTOP.M;
    const rows = [
      engine.render("frame/header-line", { x: X, text: esc(need(lines[0], "header line 1")) }),
      engine.render("frame/header-line", { x: X, text: esc(need(lines[1], "header line 2")) }),
      engine.render("frame/header-siteline", { x: X, pre: esc(need(lines[2], "header line 3")), site: esc(fitText(profile.siteHost, DESKTOP.R - X - textWidth(">> " + need(lines[2], "header site prefix"), 15), 15)) }),
    ];
    const staggered = slices.stagger(rows.slice(0, 2), h - 6 - 24, 24, 1.75, 0.25);
    const descLines = need(staggered[0], "header lines");
    const siteStaggered = slices.stagger(rows.slice(2), 18, 24, 2.25, 0.25);
    const siteLine = need(siteStaggered[0], "site line");
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
    const tail = engine.render("frame/header-tail", {
      ...themeVars(theme),
      siteLine,
      x: X,
      promptY: 56,
      cursorX: X + 18,
      cursorY: 43,
      fl: FL,
      barW: FR - FL,
      scanH: 80 - M,
    });
    return Promise.all([
      slices.sliceG(DESKTOP, h, body, {
        title: profile.displayName,
        desc: this.alt(),
        text: barLeft + barRight + profile.headerName.toUpperCase() + "$ whoami>>" + need(lines[0], "line") + need(lines[1], "line"),
        top: true,
        css: this.ctx.engine.render("css/header", {}),
        defs,
        weights: [400, 700, 800],
      }),
      slices.sliceG(DESKTOP, 80, tail, {
        title: profile.siteHost,
        desc: `Personal site and profile at ${profile.siteHost}`,
        css: this.ctx.engine.render("css/header", {}),
        defs: engine.render("frame/defs-scan", {}),
        text: ">>" + need(lines[2], "line") + profile.siteHost + "$",
        bottom: true,
      }),
    ]);
  }

  async phoneHeader(): Promise<[string, string]> {
    const { engine, theme, snapshot, profile } = this.ctx;
    const slices = this.ctx.slices;
    const g = PHONE;
    const barLeft = `sys://${profile.siteHost} // ${profile.login}`;
    const barRight = "ONLINE · NOMINAL";
    const name = profile.headerName.toUpperCase();
    const defs = engine.render("frame/defs-header", { x: g.X, clipY: 64 });
    const barLX = g.FL + g.M;
    const barRX = g.FR - g.M;
    const dotx = barRX - textWidth(barRight, 12, 1) - g.M;
    const cols = Math.floor((g.R - g.X) / (15 * ADV * SNAP)) - 3;
    const introLines = pack(wrapText(snapshot.intro === "" ? profile.displayName : snapshot.intro, g.R - g.X - textWidth(">> ", 15), 15), cols);
    const rows = [
      ...introLines.map((l) => engine.render("frame/header-line", { x: g.X, text: esc(l) })),
      ...pack(
        snapshot.projects.slice(0, profile.tuning.headerTools).map((p) => p.name),
        cols,
      ).map((l) => engine.render("frame/header-line", { x: g.X, text: esc(l) })),
      engine.render("frame/header-siteline", { x: g.X, pre: "personal site at ", site: esc(fitText(profile.siteHost, g.R - g.X - textWidth(">> personal site at ", 15), 15)) }),
    ];
    const upper = rows.slice(0, rows.length - 1);
    const lower = rows.slice(rows.length - 1);
    const h = Math.ceil((194 + (upper.length - 1) * 24 + 6) / 40) * 40;
    const nameBox = nameLayout(name, g.R - g.X, 86 + 15 * fontMetrics.ascent, h - 6 - (upper.length - 1) * 24 - 15 * fontMetrics.ascent, g.M * fontMetrics.advance);
    const step = Math.min(0.25, 0.75 / rows.length);
    const descStaggered = slices.stagger(upper, h - 6 - (upper.length - 1) * 24, 24, 1.75, step);
    const siteStaggered = slices.stagger(lower, 18, 24, 1.75 + upper.length * step, step);
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
      descLines: need(descStaggered[0], "phone header lines"),
      scanY: g.M + 35,
      scanH: h - g.M - 35,
    });
    const tail = engine.render("frame/header-tail", {
      ...themeVars(theme),
      siteLine: need(siteStaggered[0], "phone site line"),
      x: g.X,
      promptY: 52,
      cursorX: g.X + 18,
      cursorY: 39,
      fl: g.FL,
      barW: g.FR - g.FL,
      scanH: 80 - g.M,
    });
    return Promise.all([
      slices.sliceG(g, h, body, {
        title: profile.displayName,
        desc: this.alt(),
        text: barLeft + barRight + profile.headerName.toUpperCase() + "$ whoami>>·" + upper.join(""),
        top: true,
        css: this.ctx.engine.render("css/header", {}),
        defs,
        weights: [400, 700, 800],
      }),
      slices.sliceG(g, 80, tail, {
        title: profile.siteHost,
        desc: `Personal site and profile at ${profile.siteHost}`,
        css: this.ctx.engine.render("css/header", {}),
        defs: engine.render("frame/defs-scan", {}),
        text: ">>·personal site at " + profile.siteHost + "$",
        bottom: true,
      }),
    ]);
  }

  async footer(): Promise<string> {
    const { engine, profile } = this.ctx;
    const credit = "// console after @georgekobaidze";
    const body = engine.render("frame/footer", {
      x: X,
      login: profile.login,
      credit: esc(credit),
      endX: FR - 36,
    });
    return this.ctx.slices.sliceG(DESKTOP, 80, body, {
      title: "End of profile",
      desc: "Connection closed.",
      text: `$ exit connection to ${profile.login} closed. // EOF${credit}`,
      bottom: true,
    });
  }

  async phoneFooter(): Promise<string> {
    const { engine, profile } = this.ctx;
    const g = PHONE;
    const credit = "// console after @georgekobaidze";
    const body = engine.render("frame/phone-footer", {
      x: g.X,
      r: g.R,
      login: profile.login,
      credit: esc(credit),
    });
    return this.ctx.slices.sliceG(g, 120, body, {
      title: "End of profile",
      desc: "Connection closed.",
      text: `$ exit connection to ${profile.login} closed. // EOF${credit}`,
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
    const handle = fitText(b.handle, card.right - card.left, 10);
    const content = engine.render("cards/link", {
      ...themeVars(theme), icon: b.icon,
      iconX: centered ? card.x + (card.width - iconSize) / 2 : card.left,
      iconY: card.top,
      labelX, labelY: centered ? card.bottom - labelSize * fontMetrics.descent : card.top + labelSize * fontMetrics.capitals,
      labelSize, label: esc(label), anchor: centered ? "middle" : "start",
      handle: centered ? "" : engine.render("cards/link-handle", { x: card.left, y: card.bottom - 10 * fontMetrics.descent, text: esc(handle) }),
    });
    const body = engine.render("cards/shell", { ...themeVars(theme), ...card, content, delay: delay0 + k * 0.08 });
    return slices.segmentG(g, k, n, height, body, { title: b.label, desc: `${b.label}: ${b.url}`, text: label + handle + ">_" }, framed);
  }
}
