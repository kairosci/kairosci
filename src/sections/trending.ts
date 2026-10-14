import { z } from "zod";
import {
  FR,
  PHONE,
  X,
  esc,
  f1,
  heading,
  headingG,
  num,
  prompt,
  promptG,
  slice,
  sliceG,
  up40,
} from "../console.ts";
import { last, need } from "../defined.ts";
import { profileSchema, projectSchema, starsSchema, themeSchema, trendSchema } from "../schemas.ts";
import { age, monthDay, shift, short, sum, toolColor } from "../shared.ts";
import { render, themeVars } from "../templates.ts";

export function trends(
  t: z.infer<typeof themeSchema>,
  stars: z.infer<typeof starsSchema>,
  projects: z.infer<typeof projectSchema>[],
  tuning: z.infer<typeof profileSchema>["tuning"],
): { rows: z.infer<typeof trendSchema>[]; days: number } {
  const byRepo = new Map(projects.map((p) => [p.repo, p]));
  const end = stars.end;
  const windows = tuning.trendWindows;
  for (let wi = 0; wi < windows.length; wi++) {
    const days = need(windows[wi], "trend window");
    const rows: z.infer<typeof trendSchema>[] = [];
    for (const entry of Object.entries(stars.repos)) {
      const repo = need(entry[0], "trend repo");
      const s = need(entry[1], `stars for ${repo}`);
      const p = byRepo.get(repo);
      if (p === undefined) continue;
      const from = shift(end, -(days - 1));
      const gain = sum(s.daily, from, end);
      const prior = sum(s.daily, shift(from, -days), shift(from, -1));
      const isNew = age(s.created_at, end) < tuning.newDays;
      const hot = age(s.created_at, end) >= 2 * days && prior >= 20 && gain / prior >= 1.2;
      const daily: number[] = [];
      for (let i = 0; i < 30; i++) {
        const v = s.daily[shift(end, i - 29)];
        daily.push(v === undefined ? 0 : v);
      }
      if (gain > 0) {
        rows.push({
          p,
          color: toolColor(t, repo),
          gain,
          gain7: sum(s.daily, shift(end, -6), end),
          prior,
          total: sum(s.daily, "0000", end),
          isNew,
          ratio: hot ? gain / prior : null,
          daily,
        });
      }
    }
    rows.sort((a, b) => b.gain - a.gain || b.gain7 - a.gain7 || a.p.name.localeCompare(b.p.name));
    const lastWindow = wi === windows.length - 1;
    if (rows.filter((r) => r.gain >= tuning.minTrendGain).length >= tuning.minTrendGainers || lastWindow) {
      return { rows: rows.slice(0, tuning.maxTrendRows), days };
    }
  }
  throw new Error("unreachable");
}

export async function trendingHead(
  t: z.infer<typeof themeSchema>,
  profile: z.infer<typeof profileSchema>,
  stars: z.infer<typeof starsSchema>,
  days: number,
  counter: string,
): Promise<string> {
  const sub = `★ gained · ${days} days to ${monthDay(stars.end)} (UTC)`;
  let total = 0;
  for (const entry of Object.values(stars.repos)) total += entry.total;
  const body =
    `${heading(t, 44, "trending", counter)}\n` +
    `${prompt(`gh api repos/${profile.login}/{repo}/stargazers --paginate`, 0.15, "# what is getting starred")}\n` +
    render("trending/trend-sub", { x: X, sub: esc(sub), total: esc(`★ ${short(total)} total`), fr: FR - 36 });
  return slice(t, 160, body, {
    title: "Trending",
    desc: `Stars gained by ${profile.login}'s repos in the ${days} days to ${monthDay(stars.end)}.`,
    text: `~/trending${counter}$ gh api repos/${profile.login}/{repo}/stargazers --paginate # what is getting starred${sub}`,
  });
}

const ROW_CSS = `.bar{transform-box:fill-box;transform-origin:0 50%;animation:grow .9s cubic-bezier(.2,.8,.2,1) both}
@keyframes grow{from{transform:scaleX(0)}}
.lbl{animation:fadein .3s ease-out both}
.chip{animation:pulse 1s ease-in-out 3}`;

const barDefs = (c: string): string =>
  render("trending/def-bar", { color: c });

function rowDesc(r: z.infer<typeof trendSchema>, pitch: string): string {
  const chipText = r.isNew ? " (new)" : r.ratio === null ? "" : ` (${r.ratio.toFixed(1)}x the previous window)`;
  return `${r.p.name}${chipText}: +${r.gain} stars, ${r.total} total. ${pitch}.`;
}

function chip(
  t: z.infer<typeof themeSchema>,
  r: z.infer<typeof trendSchema>,
  cx: number,
  y: number,
  ty: number,
  size: number,
): string {
  if (!r.isNew && r.ratio === null) return "";
  const label = r.isNew ? "NEW" : `▲${need(r.ratio, "trend ratio").toFixed(1)}x`;
  const color = r.isNew ? t.accent2 : t.ok;
  return render("trending/trend-chip", {
    x: f1(cx),
    y,
    w: f1(label.length * 6.6 + 10),
    tx: f1(cx + 5),
    ty,
    size,
    label: esc(label),
    color,
  });
}

export async function trendingRow(
  t: z.infer<typeof themeSchema>,
  r: z.infer<typeof trendSchema>,
  i: number,
  max: number,
): Promise<string> {
  const c = r.color;
  const delay = 0.2 + i * 0.09;
  const nameW = r.p.name.length * 9;
  const w = Math.max(2, (r.gain / max) * 330);
  const hmax = Math.max(1, ...r.daily);
  const hist = r.daily
    .map((n, k) => {
      const h = n > 0 ? Math.max(1.5, (n / hmax) * 24) : 0;
      if (h === 0) return "";
      return render("trending/trend-hist", { x: 660 + k * 3, y: f1(32 - h), w: 2, h: f1(h) });
    })
    .join("");
  const pitch = r.p.tagline === "" ? r.p.kind : r.p.tagline;
  const body = render("trending/trend-row", {
    ...themeVars(t),
    stripeX: X - 10,
    stripeW: FR - 36 - X + 20,
    stripe: i % 2 === 0 ? ".04" : "0",
    x: X,
    nameY: 19,
    nameSize: 15,
    name: esc(r.p.name),
    color: c,
    chip: chip(t, r, X + nameW + 10, 7, 18, 10),
    pitchY: 33,
    pitchSize: 10.5,
    pitch: esc(pitch),
    bx: 270,
    trackY: 14,
    bw: 330,
    barH: 12,
    w: f1(w),
    delay: delay.toFixed(2),
    barDelay: (delay + 0.15).toFixed(2),
    lblX: f1(270 + w + 8),
    lblY: 25,
    lblDelay: (delay + 0.6).toFixed(2),
    gain: num(r.gain),
    hist,
    total: render("trending/trend-total", { fr: FR - 36, y: 25, total: num(r.total) }),
  });
  return slice(t, 40, body, {
    title: r.p.name,
    css: ROW_CSS,
    defs: barDefs(c),
    desc: rowDesc(r, pitch),
    text: `${r.p.name}NEW▲.x${pitch}+★${r.gain}${r.total}`,
  });
}

export async function trendingLegend(t: z.infer<typeof themeSchema>): Promise<string> {
  const text = "bar: stars gained · ticks: stars per day · NEW: under 60 days old · ▲: faster than the window before";
  void t;
  return slice(t, 40, render("trending/trend-legend", { x: X, text: esc(text) }), { title: "Legend", desc: text, text });
}

const P = PHONE;
const PBX = 180;
const PHX = P.R - 60;
const CH11 = 6.6;
const CH13 = 7.8;

export async function phoneTrendingHead(
  t: z.infer<typeof themeSchema>,
  profile: z.infer<typeof profileSchema>,
  stars: z.infer<typeof starsSchema>,
  days: number,
  counter: string,
): Promise<string> {
  const sub = `★ gained · ${days} days to ${monthDay(stars.end)} (UTC)`;
  let total = 0;
  for (const entry of Object.values(stars.repos)) total += entry.total;
  const body =
    `${headingG(t, P, 44, "trending", counter)}\n` +
    `${promptG(P, `gh api repos/${profile.login}/{repo}/stargazers`, 0.15, "# starred", 92, 13)}\n` +
    render("trending/ptrend-sub", {
      x: P.X,
      sub: esc(sub),
      total: esc(`${short(total)}★ total`),
    });
  return sliceG(t, P, 160, body, {
    title: "Trending",
    desc: `Stars gained by ${profile.login}'s repos in the ${days} days to ${monthDay(stars.end)}.`,
    text: `~/trending${counter}$ gh api repos/${profile.login}/{repo}/stargazers # starred${sub}`,
  });
}

function fit(s: string, chars: number): string {
  if (s.length <= chars) return s;
  const cut = s.slice(0, chars - 1).replace(/\s+\S*$/, "");
  return `${cut}…`;
}

export async function phoneTrendingRow(
  t: z.infer<typeof themeSchema>,
  r: z.infer<typeof trendSchema>,
  i: number,
  max: number,
): Promise<string> {
  const c = r.color;
  const delay = 0.2 + i * 0.09;
  const hasChip = r.isNew || r.ratio !== null;
  const label = r.isNew ? "NEW" : r.ratio === null ? "" : `▲${r.ratio.toFixed(1)}x`;
  const chipW = hasChip ? label.length * (CH11 + 0.5) + 9.5 : 0;
  const room = PBX - 10 - P.X - (hasChip ? chipW + 8 : 0);
  const size = Math.min(15, Math.floor((room / (r.p.name.length * 0.6)) * 2) / 2);
  const bw = Math.min(170, P.R - PBX - 6 - `+${num(max)}`.length * CH13);
  const w = Math.max(2, (r.gain / max) * bw);
  const hmax = Math.max(1, ...r.daily);
  const hist = r.daily
    .map((n, k) => {
      const h = n > 0 ? Math.max(1.5, (n / hmax) * 11) : 0;
      if (h === 0) return "";
      return render("trending/trend-hist", { x: PHX + k * 2, y: f1(33 - h), w: 1.5, h: f1(h) });
    })
    .join("");
  const pitch = r.p.tagline === "" ? r.p.kind : r.p.tagline;
  const tag = fit(pitch, Math.floor((PHX - 10 - P.X) / CH11));
  const chipX = P.X + r.p.name.length * size * 0.6 + 8;
  const body = render("trending/trend-row", {
    ...themeVars(t),
    stripeX: P.X - 10,
    stripeW: P.R - P.X + 20,
    stripe: i % 2 === 0 ? ".04" : "0",
    x: P.X,
    nameY: 18,
    nameSize: size,
    name: esc(r.p.name),
    color: c,
    chip: hasChip ? chip(t, r, chipX, 5, 16.5, 11) : "",
    pitchY: 32,
    pitchSize: 11,
    pitch: esc(tag),
    bx: PBX,
    trackY: 7,
    bw: f1(bw),
    barH: 11,
    w: f1(w),
    delay: delay.toFixed(2),
    barDelay: (delay + 0.15).toFixed(2),
    lblX: f1(PBX + w + 6),
    lblY: 17.5,
    lblDelay: (delay + 0.6).toFixed(2),
    gain: num(r.gain),
    hist,
    total: "",
  });
  return sliceG(t, P, 40, body, {
    title: r.p.name,
    css: ROW_CSS,
    defs: barDefs(c),
    desc: rowDesc(r, pitch),
    text: `${r.p.name}NEW▲.x${tag}+${r.gain}`,
  });
}

export async function phoneTrendingLegend(t: z.infer<typeof themeSchema>): Promise<string> {
  const text = "bar: stars gained · ticks: stars per day · NEW: under 60 days old · ▲: faster than the window before";
  void t;
  const cols = Math.floor((P.R - P.X) / CH11);
  const lines: string[] = [];
  for (const part of text.split(" · ")) {
    const prev = lines.length === 0 ? null : last(lines, "legend line");
    if (prev !== null && prev.length + 3 + part.length <= cols) {
      lines[lines.length - 1] = `${prev} · ${part}`;
    } else {
      lines.push(part);
    }
  }
  const h = up40(lines.length * 15 + 10);
  const y0 = (h - lines.length * 15) / 2 + 11;
  const inner = lines
    .map((l, k) => render("trending/ptrend-legend-line", { x: P.X, y: y0 + k * 15, text: esc(l) }))
    .join("");
  return sliceG(t, P, h, render("console/fade-group", { delay: "0.80", inner }), { title: "Legend", desc: text, text });
}
