import { siGithub } from "simple-icons";
import { z } from "zod";
import { DESKTOP, FL, FR, M, PHONE, W, X, esc, f1, wrap } from "../console.ts";
import { RenderContext } from "../ctx.ts";
import { first, last, need } from "../defined.ts";
import { buttonSchema } from "../schemas.ts";
import { themeVars } from "../templates.ts";

const HEADER_CSS = `@keyframes type{from{width:0}}
@keyframes flicker{0%{opacity:0}10%{opacity:1}14%{opacity:.2}22%{opacity:1}30%{opacity:.4}40%,100%{opacity:1}}
@keyframes gm{0%,92%,100%{transform:translate(0,0)}93%{transform:translate(5px,-1px)}95%{transform:translate(-3px,1px)}97%{transform:translate(2px,0)}}
@keyframes gc{0%,92%,100%{transform:translate(0,0)}93%{transform:translate(-5px,1px)}95%{transform:translate(4px,-1px)}97%{transform:translate(-2px,0)}}
.typing{animation:type .7s steps(8) .3s both}
.name{animation:flicker .9s linear 1.1s both}
.gm{animation:gm 6s linear 2s infinite}.gc{animation:gc 6s linear 2s infinite}`;

const ADV = 0.6;
const SNAP = 1.04;

function pack(items: string[], cols: number): string[] {
  const lines: string[] = [];
  for (const item of items) {
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
    const introWords = wrap(s.intro === "" ? profile.displayName : s.intro, 72);
    return [need(first(introWords, "intro line"), "intro line"), tools, "personal site and profile at "];
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
    const nameSize = Math.min(56, Math.floor((FR - X) / (profile.headerName.length * 0.6)));
    const defs = engine.render("frame/defs-header", { x: X, clipY: 80 });
    const dotx = FR - 20 - barRight.length * 8.2 - 16;
    const rows = [
      engine.render("frame/header-line", { x: X, text: esc(need(lines[0], "header line 1")) }),
      engine.render("frame/header-line", { x: X, text: esc(need(lines[1], "header line 2")) }),
      engine.render("frame/header-siteline", { x: X, pre: esc(need(lines[2], "header line 3")), site: esc(profile.siteHost) }),
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
      barLX: FL + 16,
      barLY: M + 22,
      barRX: FR - 20,
      barLeft: esc(barLeft),
      barRight: esc(barRight),
      dotx: f1(dotx),
      dotY: M + 18,
      x: X,
      whoY: 102,
      nameSize,
      nameY: 172,
      gmX: X + 3,
      gcX: X - 3,
      name: profile.headerName,
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
        text: barLeft + barRight + profile.headerName + "$ whoami>>" + need(lines[0], "line") + need(lines[1], "line"),
        top: true,
        css: HEADER_CSS,
        defs,
        weights: [400, 700, 800],
      }),
      slices.sliceG(DESKTOP, 80, tail, {
        title: profile.siteHost,
        desc: `Personal site and profile at ${profile.siteHost}`,
        css: HEADER_CSS,
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
    const nameSize = Math.min(52, Math.floor((g.R - g.X) / (profile.headerName.length * 0.6)));
    const defs = engine.render("frame/defs-header", { x: g.X, clipY: 64 });
    const dotx = g.FR - 14 - barRight.length * 8.2 - 16;
    const cols = Math.floor((g.R - g.X) / (15 * ADV * SNAP)) - 3;
    const introLines = pack(wrap(snapshot.intro === "" ? profile.displayName : snapshot.intro, 40), cols);
    const rows = [
      ...introLines.map((l) => engine.render("frame/header-line", { x: g.X, text: esc(l) })),
      ...pack(
        snapshot.projects.slice(0, profile.tuning.headerTools).map((p) => p.name),
        cols,
      ).map((l) => engine.render("frame/header-line", { x: g.X, text: esc(l) })),
      engine.render("frame/header-siteline", { x: g.X, pre: "personal site at ", site: esc(profile.siteHost) }),
    ];
    const upper = rows.slice(0, rows.length - 1);
    const lower = rows.slice(rows.length - 1);
    const h = Math.ceil((194 + (upper.length - 1) * 24 + 6) / 40) * 40;
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
      barLX: g.FL + 12,
      barLY: g.M + 22,
      barRX: g.FR - 14,
      barLeft: esc(barLeft),
      barRight: esc(barRight),
      dotx: f1(dotx),
      dotY: g.M + 18,
      x: g.X,
      whoY: 86,
      nameSize,
      nameY: 150,
      gmX: g.X + 3,
      gcX: g.X - 3,
      name: profile.headerName,
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
        text: barLeft + barRight + profile.headerName + "$ whoami>>·" + upper.join(""),
        top: true,
        css: HEADER_CSS,
        defs,
        weights: [400, 700, 800],
      }),
      slices.sliceG(g, 80, tail, {
        title: profile.siteHost,
        desc: `Personal site and profile at ${profile.siteHost}`,
        css: HEADER_CSS,
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

  async button(b: z.infer<typeof buttonSchema>, k: number, n: number, delay0 = 0.25, framed = false): Promise<string> {
    const theme = this.ctx.theme;
    const seg = W / n;
    const bw = FR - 36 - (n - 1) * seg;
    const gap = ((n - 1) * seg - X) / (n - 1) - bw;
    const lx = X + k * (bw + gap) - seg * k;
    const h = 80;
    const by = 12;
    const bh = 56;
    const cut = 12;
    const side = n === 2 ? (k === 0 ? "L" : "R") : "L";
    const box =
      side === "L"
        ? `M${f1(lx)} ${by}H${f1(lx + bw - cut)}L${f1(lx + bw)} ${by + cut}V${by + bh}H${f1(lx)}Z`
        : `M${f1(lx + cut)} ${by}H${f1(lx + bw)}V${by + bh}H${f1(lx)}L${f1(lx)} ${by + cut}Z`;
    const cutLine =
      side === "L"
        ? `M${f1(lx + bw - cut)} ${by}L${f1(lx + bw)} ${by + cut}`
        : `M${f1(lx)} ${by + cut}L${f1(lx + cut)} ${by}`;
    const maxHandle = Math.floor((bw - 24) / 6);
    const handle = b.handle.length > maxHandle ? `${b.handle.slice(0, maxHandle - 1)}…` : b.handle;
    const maxLabel = Math.floor((bw - 44) / 7.8);
    const label = b.label.length > maxLabel ? `${b.label.slice(0, maxLabel - 1)}…` : b.label;
    const body = this.ctx.engine.render("frame/button", {
      ...themeVars(theme),
      box,
      cutLine,
      by,
      iconX: Math.round(lx + 12),
      iconY: by + 11,
      icon: b.icon,
      delay: (delay0 + k * 0.08).toFixed(2),
      labelX: f1(lx + 38),
      labelY: by + 25,
      label: esc(label),
      handleX: f1(lx + 12),
      handleY: by + 46,
      handle: esc(handle),
    });
    return this.ctx.slices.segmentG(DESKTOP, k, n, h, body, { title: b.label, desc: `${b.label}: ${b.url}`, text: b.label + handle + ">_" }, framed);
  }

  async phoneButton(b: z.infer<typeof buttonSchema>, k: number, n: number, delay0 = 0.25, framed = false): Promise<string> {
    const g = PHONE;
    const seg = g.W / n;
    const x0 = g.X - 8;
    const bw = g.R + 8 - (n - 1) * seg - 1;
    const gap = ((n - 1) * seg + 1 - x0) / (n - 1) - bw;
    const lx = x0 + k * (bw + gap) - seg * k;
    const h = 80;
    const by = 12;
    const bh = 56;
    const cut = 10;
    const side = n === 2 ? (k === 0 ? "L" : "R") : "L";
    const box =
      side === "L"
        ? `M${f1(lx)} ${by}H${f1(lx + bw - cut)}L${f1(lx + bw)} ${by + cut}V${by + bh}H${f1(lx)}Z`
        : `M${f1(lx + cut)} ${by}H${f1(lx + bw)}V${by + bh}H${f1(lx)}L${f1(lx)} ${by + cut}Z`;
    const cutLine =
      side === "L"
        ? `M${f1(lx + bw - cut)} ${by}L${f1(lx + bw)} ${by + cut}`
        : `M${f1(lx)} ${by + cut}L${f1(lx + cut)} ${by}`;
    const size = 12;
    const maxLabel = Math.floor((bw - 8) / (size * ADV));
    const label = b.label.length > maxLabel ? `${b.label.slice(0, maxLabel - 1)}…` : b.label;
    const ix = Math.round(lx + bw / 2 - 9);
    const body = this.ctx.engine.render("frame/phone-button", {
      ...themeVars(this.ctx.theme),
      box,
      cutLine,
      by,
      iconX: ix,
      iconY: by + 10,
      icon: b.icon,
      delay: (delay0 + k * 0.08).toFixed(2),
      labelX: f1(lx + bw / 2),
      labelY: by + 45,
      label: esc(label),
    });
    return this.ctx.slices.segmentG(g, k, n, h, body, { title: b.label, desc: `${b.label}: ${b.url}`, text: label + ">_" }, framed);
  }
}
