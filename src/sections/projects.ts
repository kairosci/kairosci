import { readFile } from "node:fs/promises";
import { z } from "zod";
import { PHONE, baseDefs, esc, f1, halfSlice, halfSliceG, wrap } from "../console.ts";
import { need } from "../defined.ts";
import { projectSchema, themeSchema } from "../schemas.ts";
import { render, themeVars } from "../templates.ts";

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

export async function card(
  t: z.infer<typeof themeSchema>,
  p: z.infer<typeof projectSchema>,
  side: "L" | "R",
  delay: number,
): Promise<string> {
  const x0 = side === "L" ? 52 : 10;
  const cw = 378;
  const y0 = 12;
  const ch = 176;
  const pad = 18;
  const cut = 16;
  const tx = x0 + pad;
  const box =
    side === "L"
      ? `M${x0} ${y0}H${x0 + cw - cut}L${x0 + cw} ${y0 + cut}V${y0 + ch}H${x0 + cut}L${x0} ${y0 + ch - cut}Z`
      : `M${x0 + cut} ${y0}H${x0 + cw}V${y0 + ch - cut}L${x0 + cw - cut} ${y0 + ch}H${x0}V${y0 + cut}Z`;
  const cutLine =
    side === "L"
      ? `M${x0 + cw - cut} ${y0}L${x0 + cw} ${y0 + cut}`
      : `M${x0} ${y0 + cut}L${x0 + cut} ${y0}`;
  const lines = wrap(p.description, 43).slice(0, 3);
  const logo = await logoHref(p);
  const nx = logo === null ? tx : tx + 28;
  const titleW = p.name.length * 10.2;
  const sx = x0 + cw - pad;
  const fullTag = p.tagline === "" ? p.kind : `${p.kind} · ${p.tagline}`;
  const starBlock = p.stars.length * 7.2 + 16 + 8;
  const tagMax = Math.floor((sx - tx - starBlock - 12) / 7.6);
  const tag = fit(fullTag, Math.max(tagMax, 1));
  const tagc = /cli$/i.test(p.kind) ? t.ok : t.accent2;
  const tagW = tag.length * 7.6 + 16;
  const desc = lines.map((l, i) => render("card-desc", { tx, y: 100 + i * 20, text: esc(l) })).join("\n");
  const logoImg = logo === null ? "" : render("logo-img", { href: logo });
  const body = render("card", {
    ...themeVars(t),
    box,
    cutLine,
    y0,
    logoX: tx,
    logoY: y0 + 18,
    logoImg,
    tx,
    nameY: y0 + 34,
    nx,
    name: esc(p.name),
    arrowX: f1(nx + titleW + 11),
    arrowY: y0 + 31,
    arrowX2: f1(nx + titleW + 13),
    arrowY2: y0 + 23,
    tagY: y0 + 46,
    tagW: f1(tagW),
    tagTX: tx + 8,
    tagTY: y0 + 59,
    tagc,
    tag: esc(tag),
    desc,
    instY: y0 + 158,
    install: esc(p.install),
    starX: f1(sx - p.stars.length * 7.2 - 20),
    sx,
    stars: esc(p.stars),
    delay: delay.toFixed(2),
  });
  return halfSlice(t, CARD_H, side, body, {
    title: p.name,
    desc: `${p.name}: ${p.description} Install: ${p.install}. ${p.stars} stars.`,
    text: p.name + tag + p.description + `$ ${p.install}` + p.stars,
  });
}

const cols = (width: number, size: number): number => Math.floor(width / (size * 0.6) + 1e-9);

function ellipsis(s: string, n: number): string {
  const raw = s.length < n ? s : s.slice(0, n - 1);
  const sp = raw.lastIndexOf(" ");
  const kept = raw !== s && sp >= n * 0.6 ? raw.slice(0, sp) : raw;
  return `${kept.replace(/[\s.,:;!?\-–—]+$/u, "")}…`;
}
const fit = (s: string, n: number): string => (s.length <= n ? s : ellipsis(s, n));

function clamp(s: string, n: number, max: number): string[] {
  const pattern = new RegExp(`.{1,${n}}`, "g");
  const lines = wrap(s, n).flatMap((l) => (l.length <= n ? [l] : need(l.match(pattern), "wrapped line")));
  if (lines.length <= max) return lines;
  return [...lines.slice(0, max - 1), ellipsis(lines.slice(max - 1).join(" "), n)];
}

export async function phoneCard(
  t: z.infer<typeof themeSchema>,
  p: z.infer<typeof projectSchema>,
  side: "L" | "R",
  delay: number,
): Promise<string> {
  const g = PHONE;
  const gut = 12;
  const cw = (g.R - g.X - gut) / 2;
  const y0 = 6;
  const ch = CARD_H - 12;
  const pad = 10;
  const cut = 12;
  const left = side === "L" ? g.X : gut / 2;
  const tx = left + pad;
  const sx = left + cw - pad;
  const inner = sx - tx;
  const box =
    side === "L"
      ? `M${left} ${y0}H${left + cw - cut}L${left + cw} ${y0 + cut}V${y0 + ch}H${left + cut}L${left} ${y0 + ch - cut}Z`
      : `M${left + cut} ${y0}H${left + cw}V${y0 + ch - cut}L${left + cw - cut} ${y0 + ch}H${left}V${y0 + cut}Z`;
  const cutLine =
    side === "L"
      ? `M${left + cw - cut} ${y0}L${left + cw} ${y0 + cut}`
      : `M${left} ${y0 + cut}L${left + cut} ${y0}`;

  const logo = await logoHref(p);
  const nx = logo === null ? tx : tx + 25;
  const name = fit(p.name, cols(sx - nx - 20, 15));
  const nameW = name.length * 9;

  const stars = p.stars;
  const starW = stars.length * 7.2 + 16;
  const kind = p.kind;
  const tagc = /cli$/i.test(kind) ? t.ok : t.accent2;
  const tag = fit(kind, Math.floor((inner - starW - 8 - 12) / 7.6));
  const tagW = tag.length * 7.6 + 12;

  const lineCols = cols(inner, 12);
  const desc = clamp(p.description, lineCols, 4);
  const cmd = clamp(p.install, lineCols - 2, 2);
  const yb = y0 + ch - 14;
  const yc = yb - (cmd.length - 1) * 17;
  const install = cmd
    .map((l, i) => {
      if (i === 0) return render("pcard-inst0", { tx, y: yc, cmd: esc(l) });
      return render("pcard-inst1", { tx: f1(tx + 14.4), y: yc + i * 17, cmd: esc(l) });
    })
    .join("\n");

  const logoImg = logo === null ? "" : render("logo-img", { href: logo });
  const body = render("phone-card", {
    ...themeVars(t),
    box,
    cutLine,
    y0,
    logoX: tx,
    logoY: y0 + 14,
    logoImg,
    tx,
    nameY: y0 + 28,
    nx,
    name: esc(name),
    arrowX: f1(nx + nameW + 8),
    arrowY: y0 + 26,
    arrowX2: f1(nx + nameW + 10),
    arrowY2: y0 + 19,
    tagY: y0 + 40,
    tagW: f1(tagW),
    tagTX: tx + 6,
    tagTY: y0 + 52,
    tagc,
    tag: esc(tag),
    starX: f1(sx - stars.length * 7.2 - 16),
    starY: y0 + 41,
    sx,
    stars: esc(stars),
    desc: desc.map((l, i) => render("pcard-desc", { tx, y: y0 + 74 + i * 17, text: esc(l) })).join("\n"),
    install,
    delay: delay.toFixed(2),
  });
  const defs = side === "R" ? baseDefs(t, ((-g.HW % 40) + 40) % 40) : undefined;
  return halfSliceG(t, g, CARD_H, side, body, {
    title: p.name,
    desc: `${p.name}: ${p.description} Install: ${p.install}. ${p.stars} stars.`,
    text: name + tag + desc.join("") + `$ ${cmd.join("")}` + stars,
    defs,
  });
}
