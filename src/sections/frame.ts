import { siGithub } from "simple-icons";
import { z } from "zod";
import {
  FL,
  FR,
  M,
  PHONE,
  W,
  X,
  esc,
  f1,
  heading,
  headingG,
  prompt,
  promptG,
  segment,
  segmentG,
  slice,
  sliceG,
  stagger,
  wrap,
} from "../console.ts";
import { first, last, need } from "../defined.ts";
import { buttonSchema, profileSchema, snapshotSchema, themeSchema } from "../schemas.ts";
import { render, themeVars } from "../templates.ts";

const HEADER_CSS = `@keyframes type{from{width:0}}
@keyframes flicker{0%{opacity:0}10%{opacity:1}14%{opacity:.2}22%{opacity:1}30%{opacity:.4}40%,100%{opacity:1}}
@keyframes gm{0%,92%,100%{transform:translate(0,0)}93%{transform:translate(5px,-1px)}95%{transform:translate(-3px,1px)}97%{transform:translate(2px,0)}}
@keyframes gc{0%,92%,100%{transform:translate(0,0)}93%{transform:translate(-5px,1px)}95%{transform:translate(4px,-1px)}97%{transform:translate(-2px,0)}}
.typing{animation:type .7s steps(8) .3s both}
.name{animation:flicker .9s linear 1.1s both}
.gm{animation:gm 6s linear 2s infinite}.gc{animation:gc 6s linear 2s infinite}`;

function headerLines(
  s: z.infer<typeof snapshotSchema>,
  profile: z.infer<typeof profileSchema>,
): [string, string, string] {
  const tools = s.projects
    .slice(0, profile.tuning.headerTools)
    .map((p) => p.name)
    .join(" · ");
  const introWords = wrap(s.intro === "" ? profile.displayName : s.intro, 72);
  return [need(first(introWords, "intro line"), "intro line"), tools, "personal site and profile at "];
}

function iconFor(t: z.infer<typeof themeSchema>, kind: string): string {
  if (kind === "github") return render("frame/icon-github", { ...themeVars(t), d: siGithub.path });
  if (kind === "website") return render("frame/icon-website", { ...themeVars(t) });
  throw new Error(`missing icon ${kind}`);
}

export function linkButtons(
  t: z.infer<typeof themeSchema>,
  profile: z.infer<typeof profileSchema>,
): z.infer<typeof buttonSchema>[] {
  return profile.links.map((link) => ({
    label: link.label,
    handle: link.handle,
    url: link.url,
    icon: iconFor(t, link.icon),
  }));
}

export async function header(
  t: z.infer<typeof themeSchema>,
  s: z.infer<typeof snapshotSchema>,
  profile: z.infer<typeof profileSchema>,
): Promise<[string, string]> {
  const barLeft = `sys://${profile.siteHost} // node:${profile.login}`;
  const barRight = "ONLINE · ALL SYSTEMS NOMINAL";
  const lines = headerLines(s, profile);
  const h = 240;
  const nameSize = Math.min(56, Math.floor((FR - X) / (profile.headerName.length * 0.6)));
  const defs = render("frame/defs-header", { x: X, clipY: 80 });
  const dotx = FR - 20 - barRight.length * 8.2 - 16;
  const rows = [
    render("frame/header-line", { x: X, text: esc(need(lines[0], "header line 1")) }),
    render("frame/header-line", { x: X, text: esc(need(lines[1], "header line 2")) }),
    render("frame/header-siteline", { x: X, pre: esc(need(lines[2], "header line 3")), site: esc(profile.siteHost) }),
  ];
  const staggered = stagger(rows.slice(0, 2), h - 6 - 24, 24, 1.75, 0.25);
  const descLines = need(staggered[0], "header lines");
  const siteStaggered = stagger(rows.slice(2), 18, 24, 2.25, 0.25);
  const siteLine = need(siteStaggered[0], "site line");
  const body = render("frame/header-top", {
    ...themeVars(t),
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
  const tail = render("frame/header-tail", {
    ...themeVars(t),
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
    slice(t, h, body, {
      title: profile.displayName,
      desc: headerAlt(s, profile),
      text: barLeft + barRight + profile.headerName + "$ whoami>>" + need(lines[0], "line") + need(lines[1], "line"),
      top: true,
      css: HEADER_CSS,
      defs,
      weights: [400, 700, 800],
    }),
    slice(t, 80, tail, {
      title: profile.siteHost,
      desc: `Personal site and profile at ${profile.siteHost}`,
      css: HEADER_CSS,
      defs: render("frame/defs-scan", {}),
      text: ">>" + need(lines[2], "line") + profile.siteHost + "$",
      bottom: true,
    }),
  ]);
}

export function headerAlt(
  s: z.infer<typeof snapshotSchema>,
  profile: z.infer<typeof profileSchema>,
): string {
  return `${profile.displayName} (@${profile.login}). ${s.intro} Top repos: ${s.projects
    .slice(0, profile.tuning.headerTools)
    .map((p) => p.name)
    .join(", ")}.`;
}

export async function footer(
  t: z.infer<typeof themeSchema>,
  profile: z.infer<typeof profileSchema>,
): Promise<string> {
  const credit = "// console after @georgekobaidze";
  const body = render("frame/footer", {
    x: X,
    login: profile.login,
    credit: esc(credit),
    endX: FR - 36,
  });
  return slice(t, 80, body, {
    title: "End of profile",
    desc: "Connection closed.",
    text: `$ exit connection to ${profile.login} closed. // EOF${credit}`,
    bottom: true,
  });
}

export async function sectionHead(
  t: z.infer<typeof themeSchema>,
  name: string,
  counter: string,
  cmd: string,
  comment = "",
): Promise<string> {
  return slice(t, 120, heading(t, 44, name, counter) + "\n" + prompt(cmd, 0.15, comment), {
    title: name,
    desc: name,
    text: `~/${name}${counter}$ ${cmd} ${comment}`,
  });
}

export async function button(
  t: z.infer<typeof themeSchema>,
  b: z.infer<typeof buttonSchema>,
  k: number,
  n: number,
  delay0 = 0.25,
  framed = false,
): Promise<string> {
  const seg = W / n;
  const bw = FR - 36 - (n - 1) * seg;
  const gap = ((n - 1) * seg - X) / (n - 1) - bw;
  const lx = X + k * (bw + gap) - seg * k;
  const h = 80;
  const by = 12;
  const bh = 56;
  const cut = 12;
  const box = `M${f1(lx)} ${by}H${f1(lx + bw - cut)}L${f1(lx + bw)} ${by + cut}V${by + bh}H${f1(lx)}Z`;
  const maxHandle = Math.floor((bw - 24) / 6);
  const handle = b.handle.length > maxHandle ? `${b.handle.slice(0, maxHandle - 1)}…` : b.handle;
  const maxLabel = Math.floor((bw - 44) / 7.8);
  const label = b.label.length > maxLabel ? `${b.label.slice(0, maxLabel - 1)}…` : b.label;
  const body = render("frame/button", {
    ...themeVars(t),
    box,
    cutX: f1(lx + bw - cut),
    by,
    endX: f1(lx + bw),
    cutY: by + cut,
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
  return segment(t, k, n, h, body, { title: b.label, desc: `${b.label}: ${b.url}`, text: b.label + handle + ">_" }, framed);
}

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

export async function phoneHeader(
  t: z.infer<typeof themeSchema>,
  s: z.infer<typeof snapshotSchema>,
  profile: z.infer<typeof profileSchema>,
): Promise<[string, string]> {
  const g = PHONE;
  const barLeft = `sys://${profile.siteHost} // ${profile.login}`;
  const barRight = "ONLINE · NOMINAL";
  const nameSize = Math.min(52, Math.floor((g.R - g.X) / (profile.headerName.length * 0.6)));
  const defs = render("frame/defs-header", { x: g.X, clipY: 64 });
  const dotx = g.FR - 14 - barRight.length * 8.2 - 16;
  const cols = Math.floor((g.R - g.X) / (15 * ADV * SNAP)) - 3;
  const introLines = pack(wrap(s.intro === "" ? profile.displayName : s.intro, 40), cols);
  const rows = [
    ...introLines.map((l) => render("frame/header-line", { x: g.X, text: esc(l) })),
    ...pack(
      s.projects.slice(0, profile.tuning.headerTools).map((p) => p.name),
      cols,
    ).map((l) => render("frame/header-line", { x: g.X, text: esc(l) })),
    render("frame/header-siteline", { x: g.X, pre: "personal site at ", site: esc(profile.siteHost) }),
  ];
  const upper = rows.slice(0, rows.length - 1);
  const lower = rows.slice(rows.length - 1);
  const h = Math.ceil((194 + (upper.length - 1) * 24 + 6) / 40) * 40;
  const step = Math.min(0.25, 0.75 / rows.length);
  const descStaggered = stagger(upper, h - 6 - (upper.length - 1) * 24, 24, 1.75, step);
  const siteStaggered = stagger(lower, 18, 24, 1.75 + upper.length * step, step);
  const body = render("frame/header-top", {
    ...themeVars(t),
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
  const tail = render("frame/header-tail", {
    ...themeVars(t),
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
    sliceG(t, g, h, body, {
      title: profile.displayName,
      desc: headerAlt(s, profile),
      text: barLeft + barRight + profile.headerName + "$ whoami>>·" + upper.join(""),
      top: true,
      css: HEADER_CSS,
      defs,
      weights: [400, 700, 800],
    }),
    sliceG(t, g, 80, tail, {
      title: profile.siteHost,
      desc: `Personal site and profile at ${profile.siteHost}`,
      css: HEADER_CSS,
      defs: render("frame/defs-scan", {}),
      text: ">>·personal site at " + profile.siteHost + "$",
      bottom: true,
    }),
  ]);
}

export async function phoneFooter(
  t: z.infer<typeof themeSchema>,
  profile: z.infer<typeof profileSchema>,
): Promise<string> {
  const g = PHONE;
  const credit = "// console after @georgekobaidze";
  const body = render("frame/phone-footer", {
    x: g.X,
    r: g.R,
    login: profile.login,
    credit: esc(credit),
  });
  return sliceG(t, g, 120, body, {
    title: "End of profile",
    desc: "Connection closed.",
    text: `$ exit connection to ${profile.login} closed. // EOF${credit}`,
    bottom: true,
  });
}

export async function phoneSectionHead(
  t: z.infer<typeof themeSchema>,
  name: string,
  counter: string,
  cmd: string,
  comment = "",
): Promise<string> {
  const g = PHONE;
  const fit = (s: string): number => Math.min(15, Math.floor((g.R - g.X) / (s.length * ADV * SNAP) * 2) / 2);
  const one = fit(`$ ${cmd}${comment === "" ? "" : ` ${comment}`}`);
  let body: string;
  let h = 120;
  if (one >= 12.5) {
    body = promptG(g, cmd, 0.15, comment, 96, one === 15 ? undefined : one);
  } else {
    const size = Math.min(fit(`$ ${cmd}`), fit(`  ${comment}`));
    if (size < 12.5) throw new Error(`phone prompt for ~/${name} does not fit: ${cmd} ${comment}`);
    const st = size === 15 ? "" : ` style="font-size:${size}px"`;
    body =
      promptG(g, cmd, 0.15, "", 96, size === 15 ? undefined : size) +
      `\n` +
      render("frame/phone-comment", {
        x: f1(g.X + 2 * size * ADV),
        y: 96 + Math.round(size * 1.6),
        comment: esc(comment),
        sizeAttr: st,
      });
  }
  return sliceG(t, g, h, headingG(t, g, 44, name, counter) + "\n" + body, {
    title: name,
    desc: name,
    text: `~/${name}${counter}$ ${cmd} ${comment}`,
  });
}

export async function phoneButton(
  t: z.infer<typeof themeSchema>,
  b: z.infer<typeof buttonSchema>,
  k: number,
  n: number,
  delay0 = 0.25,
  framed = false,
): Promise<string> {
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
  const box = `M${f1(lx)} ${by}H${f1(lx + bw - cut)}L${f1(lx + bw)} ${by + cut}V${by + bh}H${f1(lx)}Z`;
  const size = 12;
  const maxLabel = Math.floor((bw - 8) / (size * ADV));
  const label = b.label.length > maxLabel ? `${b.label.slice(0, maxLabel - 1)}…` : b.label;
  const ix = Math.round(lx + bw / 2 - 9);
  const body = render("frame/phone-button", {
    ...themeVars(t),
    box,
    cutX: f1(lx + bw - cut),
    by,
    endX: f1(lx + bw),
    cutY: by + cut,
    iconX: ix,
    iconY: by + 10,
    icon: b.icon,
    delay: (delay0 + k * 0.08).toFixed(2),
    labelX: f1(lx + bw / 2),
    labelY: by + 45,
    label: esc(label),
  });
  return segmentG(t, g, k, n, h, body, { title: b.label, desc: `${b.label}: ${b.url}`, text: label + ">_" }, framed);
}
