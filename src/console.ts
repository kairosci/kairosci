import { readFile } from "node:fs/promises";
import subsetFont from "subset-font";
import { z } from "zod";
import { need } from "./defined.ts";
import { docSchema, geoSchema, sliceOptsSchema, themeSchema } from "./schemas.ts";
import { TemplateEngine, themeVars } from "./templates.ts";

export const W = 880;
export const M = 16;
export const FL = M;
export const FR = W - M;
export const X = 52;
export const HW = W / 2;

export function esc(s: string | number): string {
  return String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(
      /[&<>"']/g,
      (c: string) =>
        need(
          { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" }[c],
          `escape for ${c}`,
        ),
    );
}

function unescape(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (whole: string, h: string) => {
      void whole;
      return String.fromCodePoint(parseInt(h, 16));
    })
    .replace(/&#(\d+);/g, (whole: string, d: string) => {
      void whole;
      return String.fromCodePoint(Number(d));
    })
    .replace(/&(lt|gt|quot|amp);/g, (whole: string, n: string) => {
      void whole;
      const code = need({ lt: 60, gt: 62, quot: 34, amp: 38 }[n], `entity ${n}`);
      return String.fromCharCode(code);
    });
}

export function visible(markup: string): string {
  return unescape(markup.replace(/<[^>]+>/g, ""));
}

export const num = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US");
export const f1 = (n: number): string => n.toFixed(1);
export const up40 = (v: number): number => Math.ceil(v / 40) * 40;

const FONT_DIR = "node_modules/@fontsource/jetbrains-mono/files";
const fontCache = new Map<number, Buffer>();

async function faces(text: string, weights: number[]): Promise<string> {
  const chars = [...new Set(`${text}0123456789`)].sort().join("");
  const out: string[] = [];
  for (const w of weights) {
    if (!fontCache.has(w)) fontCache.set(w, await readFile(`${FONT_DIR}/jetbrains-mono-latin-${w}-normal.woff2`));
    const subset = await subsetFont(need(fontCache.get(w), `font weight ${w}`), chars, { targetFormat: "woff2" });
    out.push(
      `@font-face{font-family:'JBM';font-weight:${w};src:url(data:font/woff2;base64,${subset.toString("base64")}) format('woff2')}`,
    );
  }
  return out.join("");
}

export const DESKTOP: z.infer<typeof geoSchema> = geoSchema.parse({
  narrow: false,
  W: 880,
  M: 16,
  FL: 16,
  FR: 864,
  X: 52,
  R: 828,
  HW: 440,
});
export const PHONE: z.infer<typeof geoSchema> = geoSchema.parse({
  narrow: true,
  W: 440,
  M: 10,
  FL: 10,
  FR: 430,
  X: 28,
  R: 412,
  HW: 220,
});

export class Slices {
  private engine: TemplateEngine;
  private theme: z.infer<typeof themeSchema>;

  constructor(engine: TemplateEngine, theme: z.infer<typeof themeSchema>) {
    this.engine = engine;
    this.theme = theme;
  }

  baseCss(): string {
    const t = this.theme;
    return `text{font-family:'JBM',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px}
.dim{fill:${t.dim}}.cy{fill:${t.accent}}.fg{fill:${t.fg}}.gr{fill:${t.ok}}.wh{fill:${t.bright}}.fainter{fill:${t.fainter}}
@keyframes fadein{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}
@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
.ln{animation:fadein .35s ease-out both}
.cursor{animation:blink 1.05s step-end infinite}
.dot{animation:pulse 2s ease-in-out infinite}`;
  }

  baseDefs(gridX = 0): string {
    return this.engine.render("console/defs-base", { ...themeVars(this.theme), gridX });
  }

  async document(d: z.infer<typeof docSchema>, frame: { under: string; over: string }): Promise<string> {
    const weights = d.weights === undefined ? [400, 700] : d.weights;
    const style = `${await faces(d.text + visible(d.body), weights)}\n${this.baseCss()}\n${d.css === undefined ? "" : d.css}\n@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;
    return this.engine.render("console/doc", {
      w: d.w,
      h: d.h,
      title: esc(d.title),
      desc: esc(d.desc),
      style,
      defs: d.defs === undefined ? this.baseDefs() : d.defs,
      under: frame.under,
      body: d.body,
      over: frame.over,
    });
  }

  async sliceG(
    g: z.infer<typeof geoSchema>,
    h: number,
    body: string,
    o: z.infer<typeof sliceOptsSchema>,
  ): Promise<string> {
    if (h % 40) throw new Error(`slice height ${h} is not a multiple of 40`);
    const y0 = o.top === true ? g.M : 0;
    const y1 = o.bottom === true ? h - g.M : h;
    let rails = `M${g.FL} ${y0}V${y1}M${g.FR} ${y0}V${y1}`;
    if (o.top === true) rails += `M${g.FL} ${y0}H${g.FR}`;
    if (o.bottom === true) rails += `M${g.FL} ${y1}H${g.FR}`;
    const gy0 = o.top === true ? y0 : -40;
    const gy1 = o.bottom === true ? y1 : h + 40;
    const glow =
      `M${g.FL} ${gy0}V${gy1}M${g.FR} ${gy0}V${gy1}` +
      (o.top === true ? `M${g.FL} ${y0}H${g.FR}` : "") +
      (o.bottom === true ? `M${g.FL} ${y1}H${g.FR}` : "");
    let corners = "";
    if (o.top === true) {
      corners += this.engine.render("console/corners-top", {
        x1: g.FL - 7,
        y1: y0 + 18,
        y2: y0 - 7,
        x2: g.FL + 18,
        x3: g.FR - 18,
        x4: g.FR + 7,
      });
    }
    if (o.bottom === true) {
      corners += this.engine.render("console/corners-bottom", {
        x1: g.FL - 7,
        y1: y1 - 18,
        y2: y1 + 7,
        x2: g.FL + 18,
        x3: g.FR - 18,
        x4: g.FR + 7,
      });
    }
    const defs = this.baseDefs() + (o.defs === undefined ? "" : `\n${o.defs}`);
    return this.document({ ...o, w: g.W, h, body, defs }, {
      under: this.engine.render("console/slice-under", {
        ...themeVars(this.theme),
        glow,
        fl: g.FL,
        y0,
        rw: g.FR - g.FL,
        rh: y1 - y0,
      }),
      over: this.engine.render("console/slice-over", { ...themeVars(this.theme), rails, corners }),
    });
  }

  async halfSliceG(
    g: z.infer<typeof geoSchema>,
    h: number,
    side: "L" | "R",
    body: string,
    o: Omit<z.infer<typeof docSchema>, "w" | "h" | "body">,
  ): Promise<string> {
    if (h % 40) throw new Error(`slice height ${h} is not a multiple of 40`);
    const rx = side === "L" ? g.FL : g.HW - g.M;
    const bx0 = side === "L" ? g.FL : 0;
    const bx1 = side === "L" ? g.HW : g.HW - g.M;
    return this.document({ ...o, w: g.HW, h, body }, {
      under: this.engine.render("console/half-under", {
        ...themeVars(this.theme),
        glow: `M${rx} -40V${h + 40}`,
        rx,
        bx0,
        bw: bx1 - bx0,
        h,
      }),
      over: this.engine.render("console/half-over", { ...themeVars(this.theme), rails: `M${rx} 0V${h}` }),
    });
  }

  async segmentG(
    g: z.infer<typeof geoSchema>,
    k: number,
    n: number,
    h: number,
    body: string,
    o: Omit<z.infer<typeof docSchema>, "w" | "h" | "body" | "defs">,
    framed = false,
  ): Promise<string> {
    const seg = g.W / n;
    const x0 = seg * k;
    const first = k === 0;
    const last = k === n - 1;
    const bg0 = first ? g.FL - x0 : 0;
    const bg1 = last ? g.FR - x0 : seg;
    const lx = first ? g.FL - x0 : 0;
    const rx = last ? g.FR - x0 : seg;
    const rails = ((first || framed) ? `M${lx} 0V${h}` : "") + ((last || framed) ? `M${rx} 0V${h}` : "");
    const glow = ((first || framed) ? `M${lx} -40V${h + 40}` : "") + ((last || framed) ? `M${rx} -40V${h + 40}` : "");
    return this.document({ ...o, w: seg, h, body, defs: this.baseDefs(((-x0 % 40) + 40) % 40) }, {
      under: this.engine.render("console/segment-under", {
        ...themeVars(this.theme),
        glow,
        bg0,
        bw: bg1 - bg0,
        h,
      }),
      over: this.engine.render("console/segment-over", { ...themeVars(this.theme), rails }),
    });
  }

  headingG(g: z.infer<typeof geoSchema>, y: number, name: string, counter: string): string {
    return this.engine.render("console/heading", {
      ...themeVars(this.theme),
      x: g.X,
      r: g.R,
      y,
      name: esc(name),
      counter: esc(counter),
      yLine: y + 14,
      xEdge: g.X + 120,
    });
  }

  promptG(
    g: z.infer<typeof geoSchema>,
    cmd: string,
    delay = 0.15,
    comment = "",
    y = 96,
    size?: number,
  ): string {
    return this.engine.render("console/prompt", {
      x: g.X,
      y,
      delay: delay.toFixed(2),
      cmd: esc(cmd),
      comment: esc(comment),
      sizeAttr: size === undefined ? "" : ` style="font-size:${size}px"`,
    });
  }

  stagger(
    rows: (string | null)[],
    y0: number,
    lh: number,
    delay0 = 0.15,
    step = 0.12,
  ): [string, number] {
    const out: string[] = [];
    let y = y0;
    let i = 0;
    for (const r of rows) {
      if (r === null) {
        y += 14;
        continue;
      }
      i++;
      const inner = r.replaceAll("{y}", String(y));
      out.push(this.engine.render("console/stagger-row", { delay: (delay0 + i * step).toFixed(2), inner }));
      y += lh;
    }
    return [out.join("\n"), y];
  }

  async sectionHead(name: string, counter: string, cmd: string, comment = ""): Promise<string> {
    return this.sliceG(DESKTOP, 120, this.headingG(DESKTOP, 44, name, counter) + "\n" + this.promptG(DESKTOP, cmd, 0.15, comment), {
      title: name,
      desc: name,
      text: `~/${name}${counter}$ ${cmd} ${comment}`,
    });
  }

  async phoneSectionHead(name: string, counter: string, cmd: string, comment = ""): Promise<string> {
    const fit = (s: string): number =>
      Math.min(15, Math.floor((PHONE.R - PHONE.X) / (s.length * 0.6 * 1.04) * 2) / 2);
    const one = fit(`$ ${cmd}${comment === "" ? "" : ` ${comment}`}`);
    let body: string;
    let h = 120;
    if (one >= 12.5) {
      body = this.promptG(PHONE, cmd, 0.15, comment, 96, one === 15 ? undefined : one);
    } else {
      const size = Math.min(fit(`$ ${cmd}`), fit(`  ${comment}`));
      if (size < 12.5) throw new Error(`phone prompt for ~/${name} does not fit: ${cmd} ${comment}`);
      const st = size === 15 ? "" : ` style="font-size:${size}px"`;
      body =
        this.promptG(PHONE, cmd, 0.15, "", 96, size === 15 ? undefined : size) +
        `\n` +
        this.engine.render("frame/phone-comment", {
          x: f1(PHONE.X + 2 * size * 0.6),
          y: 96 + Math.round(size * 1.6),
          comment: esc(comment),
          sizeAttr: st,
        });
    }
    return this.sliceG(PHONE, h, this.headingG(PHONE, 44, name, counter) + "\n" + body, {
      title: name,
      desc: name,
      text: `~/${name}${counter}$ ${cmd} ${comment}`,
    });
  }
}

export function wrap(s: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of s.split(/\s+/)) {
    if (line !== "" && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line === "" ? word : `${line} ${word}`;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}
