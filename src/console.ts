import { readFile } from "node:fs/promises";
import subsetFont from "subset-font";
import { z } from "zod";
import { need } from "./defined.ts";
import { docSchema, geoSchema, sliceOptsSchema, themeSchema } from "./schemas.ts";
import { TemplateEngine, createThemeSvgVariables } from "./templates.ts";

export const W = 880;
export const M = 16;
export const FL = M;
export const FR = W - M;
export const X = 52;
export const HW = W / 2;

export function escapeMarkup(s: string | number): string {
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
    .replace(/&#x([0-9a-f]+);/gi, (_whole: string, h: string) => {
      return String.fromCodePoint(parseInt(h, 16));
    })
    .replace(/&#(\d+);/g, (_whole: string, d: string) => {
      return String.fromCodePoint(Number(d));
    })
    .replace(/&(lt|gt|quot|amp);/g, (_whole: string, n: string) => {
      const code = need({ lt: 60, gt: 62, quot: 34, amp: 38 }[n], `entity ${n}`);
      return String.fromCharCode(code);
    });
}

export function extractVisibleText(markup: string): string {
  return unescape(markup.replace(/<[^>]+>/g, ""));
}

export const formatNumber = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US");
export const formatSvgNumber = (n: number): string => n.toFixed(1);
export const roundUpTo40 = (v: number): number => Math.ceil(v / 40) * 40;

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
  width: 880,
  margin: 16,
  frameLeft: 16,
  frameRight: 864,
  contentLeft: 52,
  contentRight: 828,
  centerX: 440,
});
export const PHONE: z.infer<typeof geoSchema> = geoSchema.parse({
  narrow: true,
  width: 440,
  margin: 10,
  frameLeft: 10,
  frameRight: 430,
  contentLeft: 28,
  contentRight: 412,
  centerX: 220,
});

export class Slices {
  private engine: TemplateEngine;
  private theme: z.infer<typeof themeSchema>;

  constructor(engine: TemplateEngine, theme: z.infer<typeof themeSchema>) {
    this.engine = engine;
    this.theme = theme;
  }

  baseCss(): string {
    return this.engine.render("css/base", createThemeSvgVariables(this.theme));
  }

  baseDefs(gridX = 0): string {
    return this.engine.render("console/defs-base", { ...createThemeSvgVariables(this.theme), gridX });
  }

  async document(d: z.infer<typeof docSchema>, frame: { under: string; over: string }): Promise<string> {
    const weights = d.weights === undefined ? [400, 700] : d.weights;
    const style = `${await faces(d.text + extractVisibleText(d.body), weights)}\n${this.baseCss()}\n${d.css === undefined ? "" : d.css}\n${this.engine.render("css/reduced-motion", {})}`;
    return this.engine.render("console/doc", {
      w: d.w,
      h: d.h,
      title: escapeMarkup(d.title),
      desc: escapeMarkup(d.desc),
      style,
      defs: d.defs === undefined ? this.baseDefs() : d.defs,
      under: frame.under,
      body: d.body,
      over: frame.over,
    });
  }

  async createSvgSlice(
    g: z.infer<typeof geoSchema>,
    h: number,
    body: string,
    o: z.infer<typeof sliceOptsSchema>,
  ): Promise<string> {
    if (h % 40) throw new Error(`slice height ${h} is not a multiple of 40`);
    const y0 = o.top === true ? g.margin : 0;
    const y1 = o.bottom === true ? h - g.margin : h;
    let rails = `M${g.frameLeft} ${y0}V${y1}M${g.frameRight} ${y0}V${y1}`;
    if (o.top === true) rails += `M${g.frameLeft} ${y0}H${g.frameRight}`;
    if (o.bottom === true) rails += `M${g.frameLeft} ${y1}H${g.frameRight}`;
    const gy0 = o.top === true ? y0 : -40;
    const gy1 = o.bottom === true ? y1 : h + 40;
    const glow =
      `M${g.frameLeft} ${gy0}V${gy1}M${g.frameRight} ${gy0}V${gy1}` +
      (o.top === true ? `M${g.frameLeft} ${y0}H${g.frameRight}` : "") +
      (o.bottom === true ? `M${g.frameLeft} ${y1}H${g.frameRight}` : "");
    let corners = "";
    if (o.top === true) {
      corners += this.engine.render("console/corners-top", {
        x1: g.frameLeft - 7,
        y1: y0 + 18,
        y2: y0 - 7,
        x2: g.frameLeft + 18,
        x3: g.frameRight - 18,
        x4: g.frameRight + 7,
      });
    }
    if (o.bottom === true) {
      corners += this.engine.render("console/corners-bottom", {
        x1: g.frameLeft - 7,
        y1: y1 - 18,
        y2: y1 + 7,
        x2: g.frameLeft + 18,
        x3: g.frameRight - 18,
        x4: g.frameRight + 7,
      });
    }
    const defs = this.baseDefs() + (o.defs === undefined ? "" : `\n${o.defs}`);
    return this.document({ ...o, w: g.width, h, body, defs }, {
      under: this.engine.render("console/slice-under", {
        ...createThemeSvgVariables(this.theme),
        glow,
        fl: g.frameLeft,
        y0,
        rw: g.frameRight - g.frameLeft,
        rh: y1 - y0,
      }),
      over: this.engine.render("console/slice-over", { ...createThemeSvgVariables(this.theme), rails, corners }),
    });
  }

  async createHalfSvgSlice(
    g: z.infer<typeof geoSchema>,
    h: number,
    side: "L" | "R",
    body: string,
    o: Omit<z.infer<typeof docSchema>, "w" | "h" | "body">,
  ): Promise<string> {
    if (h % 40) throw new Error(`slice height ${h} is not a multiple of 40`);
    const rx = side === "L" ? g.frameLeft : g.centerX - g.margin;
    const bx0 = side === "L" ? g.frameLeft : 0;
    const bx1 = side === "L" ? g.centerX : g.centerX - g.margin;
    return this.document({ ...o, w: g.centerX, h, body }, {
      under: this.engine.render("console/half-under", {
        ...createThemeSvgVariables(this.theme),
        glow: `M${rx} -40V${h + 40}`,
        rx,
        bx0,
        bw: bx1 - bx0,
        h,
      }),
      over: this.engine.render("console/half-over", { ...createThemeSvgVariables(this.theme), rails: `M${rx} 0V${h}` }),
    });
  }

  async createSegmentSvgSlice(
    g: z.infer<typeof geoSchema>,
    k: number,
    n: number,
    h: number,
    body: string,
    o: Omit<z.infer<typeof docSchema>, "w" | "h" | "body" | "defs">,
    framed = false,
  ): Promise<string> {
    const seg = g.width / n;
    const x0 = seg * k;
    const first = k === 0;
    const last = k === n - 1;
    const bg0 = first ? g.frameLeft - x0 : 0;
    const bg1 = last ? g.frameRight - x0 : seg;
    const lx = first ? g.frameLeft - x0 : 0;
    const rx = last ? g.frameRight - x0 : seg;
    const rails = ((first || framed) ? `M${lx} 0V${h}` : "") + ((last || framed) ? `M${rx} 0V${h}` : "");
    const glow = ((first || framed) ? `M${lx} -40V${h + 40}` : "") + ((last || framed) ? `M${rx} -40V${h + 40}` : "");
    return this.document({ ...o, w: seg, h, body, defs: this.baseDefs(((-x0 % 40) + 40) % 40) }, {
      under: this.engine.render("console/segment-under", {
        ...createThemeSvgVariables(this.theme),
        glow,
        bg0,
        bw: bg1 - bg0,
        h,
      }),
      over: this.engine.render("console/segment-over", { ...createThemeSvgVariables(this.theme), rails }),
    });
  }

  renderSectionHeading(g: z.infer<typeof geoSchema>, y: number, name: string, counter: string): string {
    return this.engine.render("console/heading", {
      ...createThemeSvgVariables(this.theme),
      x: g.contentLeft,
      r: g.contentRight,
      y,
      name: escapeMarkup(name),
      counter: escapeMarkup(counter),
      yLine: y + 14,
      xEdge: g.contentLeft + 120,
    });
  }

  renderCommandPrompt(
    g: z.infer<typeof geoSchema>,
    cmd: string,
    delay = 0.15,
    comment = "",
    y = 96,
    size?: number,
  ): string {
    return this.engine.render("console/prompt", {
      x: g.contentLeft,
      y,
      delay: delay.toFixed(2),
      cmd: escapeMarkup(cmd),
      comment: escapeMarkup(comment),
      sizeAttr: size === undefined ? "" : ` style="font-size:${size}px"`,
    });
  }

  renderStaggeredRows(
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

  async renderDesktopSectionHeader(name: string, counter: string, cmd: string, comment = ""): Promise<string> {
    return this.createSvgSlice(DESKTOP, 120, this.renderSectionHeading(DESKTOP, 44, name, counter) + "\n" + this.renderCommandPrompt(DESKTOP, cmd, 0.15, comment), {
      title: name,
      desc: name,
      text: `~/${name}${counter}$ ${cmd} ${comment}`,
    });
  }

  async renderPhoneSectionHeader(name: string, counter: string, cmd: string, comment = ""): Promise<string> {
    const fit = (s: string): number =>
      Math.min(15, Math.floor((PHONE.contentRight - PHONE.contentLeft) / (s.length * 0.6 * 1.04) * 2) / 2);
    const one = fit(`$ ${cmd}${comment === "" ? "" : ` ${comment}`}`);
    let body: string;
    let h = 120;
    if (one >= 12.5) {
      body = this.renderCommandPrompt(PHONE, cmd, 0.15, comment, 96, one === 15 ? undefined : one);
    } else {
      const size = Math.min(fit(`$ ${cmd}`), fit(`  ${comment}`));
      if (size < 12.5) throw new Error(`phone prompt for ~/${name} does not fit: ${cmd} ${comment}`);
      const st = size === 15 ? "" : ` style="font-size:${size}px"`;
      body =
        this.renderCommandPrompt(PHONE, cmd, 0.15, "", 96, size === 15 ? undefined : size) +
        `\n` +
        this.engine.render("frame/phone-comment", {
          x: formatSvgNumber(PHONE.contentLeft + 2 * size * 0.6),
          y: 96 + Math.round(size * 1.6),
          comment: escapeMarkup(comment),
          sizeAttr: st,
        });
    }
    return this.createSvgSlice(PHONE, h, this.renderSectionHeading(PHONE, 44, name, counter) + "\n" + body, {
      title: name,
      desc: name,
      text: `~/${name}${counter}$ ${cmd} ${comment}`,
    });
  }
}

export function wrapWords(s: string, width: number): string[] {
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
