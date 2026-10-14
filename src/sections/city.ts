import { createHash } from "node:crypto";
import { z } from "zod";
import {
  FL,
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
} from "../console.ts";
import { first, need } from "../defined.ts";
import { calendarSchema, profileSchema, skyBoxSchema, themeSchema } from "../schemas.ts";
import { monthDay } from "../shared.ts";
import { WHEN, daylight, mix, phaseColor, sky, skyLayer } from "../sky.ts";
import { render } from "../templates.ts";
import { phaseSchema } from "../schemas.ts";

export const CITY_TW = 25;
export const CITY_TH = 12.5;
export const CITY_OX = 152.5;
export const CITY_OY = 262;
export const CITY_HMAX = 118;

export const p2 = (x: number, y: number): string => `${f1(x)},${f1(y)}`;

export function* rng(seed: string): Generator<number> {
  let state = BigInt(`0x${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`);
  const mask = (1n << 64n) - 1n;
  while (true) {
    state = (state * 6364136223846793005n + 1442695040888963407n) & mask;
    yield Number(state >> 11n) / 2 ** 53;
  }
}

export function levels(counts: number[]): number[] {
  const nz = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (nz.length === 0) return [1, 1, 1];
  const q = (f: number): number => need(nz[Math.min(nz.length - 1, Math.floor(nz.length * f))], "quartile");
  return [q(0.25), q(0.5), q(0.75)];
}

function deskIso(): { tw: number; th: number; ox: number; oy: number; hmax: number; s: number; ws: number } {
  return { tw: CITY_TW, th: CITY_TH, ox: CITY_OX, oy: CITY_OY, hmax: CITY_HMAX, s: 1, ws: 1 };
}

const LIT = { night: 0.55, dawn: 0.2, day: 0.05, dusk: 0.24 };

function faces(t: z.infer<typeof themeSchema>, p: z.infer<typeof phaseSchema>): { left: string; right: string; offL: string; offR: string } {
  const city = t.city;
  if (p === "night") return { left: city.left, right: city.right, offL: city.winOff, offR: city.winOff };
  if (p === "dawn") {
    return {
      left: mix(city.left, "#4b2a8a", 0.12),
      right: mix(city.right, "#ff7ab6", 0.1),
      offL: city.winOff,
      offR: mix(city.winOff, "#ff9ec7", 0.32),
    };
  }
  if (p === "dusk") {
    return {
      left: mix(city.left, "#6a1b9a", 0.14),
      right: mix(city.right, "#ff9e3d", 0.12),
      offL: city.winOff,
      offR: mix(city.winOff, "#ff9e3d", 0.45),
    };
  }
  return {
    left: mix(city.left, daylight(t), 0.1),
    right: mix(city.right, daylight(t), 0.08),
    offL: mix(city.winOff, t.accent, 0.14),
    offR: mix(city.winOff, t.accent, 0.22),
  };
}

function cells(calendar: z.infer<typeof calendarSchema>): { w: number; dow: number; n: number }[] {
  const start = Date.parse(`${need(first(calendar, "calendar")[0], "first day")}T00:00:00Z`);
  return calendar
    .map((entry) => {
      const date = new Date(`${need(entry[0], "day")}T00:00:00Z`);
      const idx = Math.round((date.getTime() - start) / 864e5);
      return { w: Math.floor(idx / 7), dow: date.getUTCDay(), n: need(entry[1], "count") };
    })
    .sort((a, b) => a.w + a.dow - (b.w + b.dow) || a.w - b.w);
}

function ranker(counts: number[]): (n: number) => number {
  const nz = counts.filter((c) => c > 0).sort((a, b) => a - b);
  return (n: number) => {
    const lo = nz.indexOf(n);
    const hi = nz.lastIndexOf(n);
    return nz.length > 1 ? (lo + hi) / 2 / (nz.length - 1) : 1;
  };
}

function yearStats(calendar: z.infer<typeof calendarSchema>): { total: number; active: number; busiest: [string, number] } {
  const year = calendar.slice(-365);
  const seed = first(year, "year");
  let total = 0;
  let active = 0;
  let busiest: [string, number] = [need(seed[0], "day"), need(seed[1], "count")];
  for (const entry of year) {
    const n = need(entry[1], "count");
    total += n;
    if (n > 0) active++;
    if (n > busiest[1]) busiest = [need(entry[0], "day"), n];
  }
  return { total, active, busiest };
}

function buildings(
  t: z.infer<typeof themeSchema>,
  calendar: z.infer<typeof calendarSchema>,
  next: () => number,
  g: { tw: number; th: number; ox: number; oy: number; hmax: number; s: number; ws: number },
  p: z.infer<typeof phaseSchema>,
): string {
  const city = t.city;
  const face = faces(t, p);
  const counts = calendar.map((entry) => need(entry[1], "count"));
  const rank = ranker(counts);
  const lv = levels(counts);
  const tw = g.tw;
  const th = g.th;
  const s = g.s;
  const ws = g.ws;
  const shapes: string[] = [];
  let flick = 0;
  for (const cell of cells(calendar)) {
    const cx = g.ox + ((cell.w - cell.dow) * tw) / 2;
    const cy = g.oy + ((cell.w + cell.dow) * th) / 2;
    const left: [number, number] = [cx - tw / 2, cy];
    const right: [number, number] = [cx + tw / 2, cy];
    const top: [number, number] = [cx, cy - th / 2];
    const bottom: [number, number] = [cx, cy + th / 2];
    if (cell.n === 0) {
      shapes.push(
        render("city-empty", {
          d: `M${p2(top[0], top[1])}L${p2(right[0], right[1])}L${p2(bottom[0], bottom[1])}L${p2(left[0], left[1])}Z`,
          fill: city.empty,
          stroke: city.emptyStroke,
          sw: String(0.6 * s).replace(/^0\./, "."),
        }),
      );
      continue;
    }
    const h = 8 * s + (g.hmax - 8 * s) * rank(cell.n) ** 1.3;
    const level = lv.filter((lim) => cell.n > lim).length;
    const raised: [number, number][] = [top, right, bottom, left].map(([x, y]) => [x, y - h]);
    const up = {
      top: need(raised[0], "roof corner"),
      right: need(raised[1], "roof corner"),
      bottom: need(raised[2], "roof corner"),
      left: need(raised[3], "roof corner"),
    };
    shapes.push(
      render("city-face", {
        dl: `${p2(left[0], left[1])}L${p2(bottom[0], bottom[1])}L${p2(up.bottom[0], up.bottom[1])}L${p2(up.left[0], up.left[1])}Z`,
        dr: `${p2(bottom[0], bottom[1])}L${p2(right[0], right[1])}L${p2(up.right[0], up.right[1])}L${p2(up.bottom[0], up.bottom[1])}Z`,
        left: face.left,
        right: face.right,
      }) +
        render("city-roof", {
          d: `M${p2(up.top[0], up.top[1])}L${p2(up.right[0], up.right[1])}L${p2(up.bottom[0], up.bottom[1])}L${p2(up.left[0], up.left[1])}Z`,
          fill: need(city.roofs[level], "roof color"),
        }),
    );
    const on: string[] = [];
    const side: string[] = [];
    const offL: string[] = [];
    const offR: string[] = [];
    const fl: string[][] = [];
    const sides = [
      { face: "l", a: left, b: bottom },
      { face: "r", a: bottom, b: right },
    ];
    for (const sideDef of sides) {
      for (let row = 0; row < Math.floor((h - 6 * ws) / (7 * ws)); row++) {
        const v0 = (5 + row * 7) * ws;
        for (const u0 of [0.18, 0.58]) {
          const u = next();
          const litAtNight = u < LIT.night;
          if (!litAtNight && next() < 0.5) continue;
          const flickers = litAtNight && next() < 0.03;
          const corners: [number, number][] = [
            [u0, v0],
            [u0 + 0.26, v0],
            [u0 + 0.26, v0 + 3.2 * ws],
            [u0, v0 + 3.2 * ws],
          ];
          const pts = corners.map(([uu, vv]) =>
            p2(sideDef.a[0] + (sideDef.b[0] - sideDef.a[0]) * uu, sideDef.a[1] + (sideDef.b[1] - sideDef.a[1]) * uu - vv),
          );
          const seg = `M${pts.join("L")}Z`;
          if (u >= LIT[p]) {
            if (sideDef.face === "l") offL.push(seg);
            else offR.push(seg);
          } else if (flickers) {
            fl.push([seg, sideDef.face]);
          } else if (sideDef.face === "l") {
            on.push(seg);
          } else {
            side.push(seg);
          }
        }
      }
    }
    if (face.offL === face.offR) {
      if (offL.length + offR.length > 0) shapes.push(render("city-win", { d: [...offL, ...offR].join(""), fill: face.offL }));
    } else {
      if (offL.length > 0) shapes.push(render("city-win", { d: offL.join(""), fill: face.offL }));
      if (offR.length > 0) shapes.push(render("city-win", { d: offR.join(""), fill: face.offR }));
    }
    if (on.length > 0) shapes.push(render("city-win", { d: on.join(""), fill: city.winOn }));
    if (side.length > 0) shapes.push(render("city-win", { d: side.join(""), fill: city.winSide }));
    for (const flicker of fl) {
      flick++;
      shapes.push(
        render("city-flicker", {
          d: need(flicker[0], "window"),
          fill: need(flicker[1], "window face") === "l" ? city.winOn : city.winSide,
          cls: `f${flick % 3}`,
        }),
      );
    }
  }
  return shapes.join("");
}

function skyFade(g: { tw: number; th: number; ox: number; oy: number }): { x: number; left: number[]; right: number[] } {
  const x = g.ox;
  const y = g.oy - g.th / 2;
  const n = Math.hypot(g.tw, g.th);
  const a = (6 * g.tw) / 25;
  const b = (30 * g.tw) / 25;
  const along = (nx: number, ny: number): number[] => [x - nx * a, y - ny * a, x + nx * b, y + ny * b];
  return { x, left: along(g.th / n, g.tw / n), right: along(-g.th / n, g.tw / n) };
}

function stars(
  t: z.infer<typeof themeSchema>,
  next: () => number,
  field: { x0: number; w: number; y0: number; h: number; n: number; skip: (x: number, y: number) => boolean },
  p: z.infer<typeof phaseSchema>,
): string {
  const keep = p === "night" ? 1 : p === "dawn" ? 0.4 : p === "day" ? 0 : 0.5;
  const sizes = [0.6, 0.8, 1.1];
  const out: string[] = [];
  for (let i = 0; i < field.n; i++) {
    const x = field.x0 + next() * field.w;
    const y = field.y0 + next() * field.h;
    if (field.skip(x, y)) continue;
    const o = 0.35 + next() * 0.5;
    if (y >= field.y0 + field.h * keep) continue;
    const vars = {
      x: f1(x),
      y: f1(y),
      r: need(sizes[i % 3], "star size"),
      fill: t.city.sky,
      opacity: (p === "night" ? o : o * 0.7).toFixed(2),
    };
    if (i % 3 === 0) out.push(render("star-tw", { ...vars, cls: `s${i % 3}` }));
    else out.push(render("star", vars));
  }
  return render("fade-group", { delay: "0.00", inner: out.join("") });
}

const r2 = (v: number): string => String(Number(v.toFixed(2)));

function moon(t: z.infer<typeof themeSchema>, cx: number, cy: number, k: number): string {
  return render("moon", {
    cx,
    cy,
    glowR: r2(40 * k),
    faceR: r2(14 * k),
    moon: t.moon,
    shadeX: r2(cx + 6 * k),
    shadeY: r2(cy - 5 * k),
    shadeR: r2(12.5 * k),
    bg: t.bg,
  });
}

function plane(t: z.infer<typeof themeSchema>, y: number): string {
  return render("plane", { y, fainter: t.fainter });
}

function scene(
  t: z.infer<typeof themeSchema>,
  p: z.infer<typeof phaseSchema>,
  box: z.infer<typeof skyBoxSchema>,
  frame: { x: number; w: number; h: number },
): { css: string; defs: string; under: (stars: string) => string } {
  const css = [
    `@keyframes tw{0%,100%{opacity:.9}50%{opacity:.15}}
@keyframes fl{0%,40%,100%{opacity:1}45%,60%{opacity:.1}}
@keyframes blink{0%,90%,100%{opacity:0}93%{opacity:1}}
@keyframes fly{from{transform:translate(${frame.x - 10}px,0)}to{transform:translate(${frame.x + frame.w + 70}px,-30px)}}
.s0{animation:tw 3s infinite}
.f0{animation:fl 5s infinite}.f1{animation:fl 7s infinite 2s}.f2{animation:fl 9s infinite 4s}
.plane{animation:fly 26s linear infinite}.bl{animation:blink 1.4s infinite}`,
  ];
  const defs = [render("defs-frame", { x: frame.x, w: frame.w, h: frame.h })];
  if (p === "night") {
    defs.push(render("defs-moonglow", { moon: t.moon }));
    return {
      css: css.join("\n"),
      defs: defs.join("\n"),
      under: (st: string) => `${st}\n${moon(t, need(box.high[0], "moon x"), need(box.high[1], "moon y"), box.k)}`,
    };
  }
  const layer = skyLayer(t, p, box);
  css.push(layer.css);
  defs.push(layer.defs);
  return {
    css: css.join("\n"),
    defs: defs.join("\n"),
    under: (st: string) => `${layer.grad}\n${st}\n${render("fade-group", { delay: "0.00", inner: `${layer.sun}\n${layer.clouds}` })}`,
  };
}

function readout(
  t: z.infer<typeof themeSchema>,
  x: number,
  y: number,
  size: number,
  anchor: "start" | "end",
): string {
  const s = sky();
  const vars = {
    x,
    y,
    size,
    phase: s.phase,
    color: phaseColor(t, s.phase),
    event: s.event,
    at: esc(s.at),
  };
  if (anchor === "end") return render("readout-end", vars);
  return render("readout-start", vars);
}

function legendRow(t: z.infer<typeof themeSchema>, x: number, y: number, size: number, sw: number): string {
  const city = t.city;
  const cw = size * 0.6;
  const x0 = x + 5 * cw + 7;
  const fills = [city.empty, ...city.roofs];
  const swatches = fills
    .map((c, i) => render("city-sw", { x: f1(x0 + i * (sw + 5)), y: f1(y - sw + 1), sw, fill: c }))
    .join("");
  return render("city-legend", { x, y, size, swatches, x2: f1(x0 + 5 * (sw + 5) + 1) });
}

export async function city(
  t: z.infer<typeof themeSchema>,
  calendar: z.infer<typeof calendarSchema>,
  profile: z.infer<typeof profileSchema>,
  updated: string,
  counter: string,
): Promise<string> {
  const city = t.city;
  const p = sky().phase;
  const counts = calendar.map((entry) => need(entry[1], "count"));
  const total = counts.reduce((a, b) => a + b, 0);
  const generator = rng(`${updated}-${total}`);
  const next = (): number => need(generator.next().value, "rng");
  const shapes = buildings(t, calendar, next, deskIso(), p);

  const sc = scene(
    t,
    p,
    {
      x0: FL,
      x1: FR,
      top: 62,
      horizon: 600,
      bottom: 680,
      fade: skyFade(deskIso()),
      high: [FR - 80, 160],
      low: [FR - 86, 486],
      k: 1,
      clouds: [
        [488, 150, 1],
        [606, 226, 0.8],
      ],
      drift: 40,
    },
    { x: FL, w: FR - FL, h: 680 },
  );
  const st = stars(t, next, { x0: 470, w: 350, y0: 118, h: 150, n: 46, skip: (x, y) => x > 700 && y < 215 }, p);
  const year = yearStats(calendar);
  const busiest = year.busiest;
  const infoParts: string[] = [
    render("city-info-total", { x: FR - 36, y: 300, total: num(year.total) }),
  ];
  if (busiest[1] > 0) {
    infoParts.push(render("city-info-busiest", { x: FR - 36, y: 320, date: monthDay(need(busiest[0], "day")), count: busiest[1] }));
  }
  infoParts.push(render("city-info-active", { x: FR - 36, y: busiest[1] > 0 ? 340 : 320, count: year.active }));
  const legend = [city.empty, ...city.roofs]
    .map((c, i) => render("city-sw", { x: X + 52 + i * 16, y: 642, sw: 11, fill: c }))
    .join("");
  const body =
    `${heading(t, 44, "contribution-city", counter)}\n` +
    `${prompt("render-city --last 365d", 0.15, "# one building per day")}\n` +
    `${sc.under(st)}\n` +
    `${plane(t, 132)}\n` +
    `${infoParts.join("\n")}\n` +
    `${shapes}\n` +
    render("city-legend", { x: X, y: 652, size: 11, swatches: legend, x2: X + 52 + 5 * 16 + 6 }) +
    `\n${readout(t, FR - 36, 652, 11, "end")}`;
  return slice(t, 680, body, {
    title: `Contribution city ${need(WHEN[p], "phase word")}`,
    desc: cityAlt(calendar, profile.login),
    css: sc.css,
    defs: sc.defs,
    text: `~/contribution-city${counter}$ render-city --last 365d # one building per dayquietskyscraper`,
  });
}

export function cityAlt(calendar: z.infer<typeof calendarSchema>, login: string): string {
  const stats = yearStats(calendar);
  const s = sky();
  return (
    `Contribution city: an isometric skyline ${need(WHEN[s.phase], "phase word")} (${s.event} ${s.at} in ${login}'s time zone) with one building per day of the last year, taller and brighter for busier days. ${num(stats.total)} contributions` +
    (stats.busiest[1] > 0 ? `, busiest day ${monthDay(need(stats.busiest[0], "day"), true)} with ${stats.busiest[1]}.` : ".")
  );
}

export async function phoneCity(
  t: z.infer<typeof themeSchema>,
  calendar: z.infer<typeof calendarSchema>,
  profile: z.infer<typeof profileSchema>,
  updated: string,
  counter: string,
): Promise<string> {
  const g = PHONE;
  const p = sky().phase;
  const counts = calendar.map((entry) => need(entry[1], "count"));
  const total = counts.reduce((a, b) => a + b, 0);
  const generator = rng(`${updated}-${total}`);
  const next = (): number => need(generator.next().value, "rng");
  const phoneIso = { tw: 13, th: 6.5, ox: 67.5, oy: 180, hmax: 68, s: 0.52, ws: 0.7 };
  const shapes = buildings(t, calendar, next, phoneIso, p);
  const H = 400;
  const sc = scene(
    t,
    p,
    {
      x0: g.FL,
      x1: g.FR,
      top: 62,
      horizon: 340,
      bottom: H,
      fade: skyFade(phoneIso),
      high: [g.R - 34, 134],
      low: [g.R - 30, 286],
      k: 0.6,
      clouds: [
        [236, 124, 0.8],
        [292, 186, 0.62],
      ],
      drift: 22,
    },
    { x: g.FL, w: g.FR - g.FL, h: H },
  );
  const st = stars(t, next, { x0: 150, w: 270, y0: 104, h: 110, n: 34, skip: (x, y) => x > 340 && y < 168 }, p);
  const year = yearStats(calendar);
  const busiest = year.busiest;
  const infoParts: string[] = [render("city-pinfo-total", { x: g.X, y: 294, total: num(year.total) })];
  if (busiest[1] > 0) {
    infoParts.push(
      render("city-pinfo-busiest", { x: g.X, y: 312, date: monthDay(need(busiest[0], "day")), count: busiest[1] }),
    );
  }
  infoParts.push(
    render("city-pinfo-active", { x: g.X, y: busiest[1] > 0 ? 330 : 312, count: year.active }),
  );
  const body =
    `${headingG(t, g, 44, "contribution-city", counter)}\n` +
    `${promptG(g, "render-city --last 365d", 0.15, "# one building per day", 90, 13)}\n` +
    `${sc.under(st)}\n` +
    `${plane(t, 120)}\n` +
    `${shapes}\n` +
    `${infoParts.join("\n")}\n` +
    `${readout(t, g.X, 356, 12, "start")}\n` +
    `${legendRow(t, g.X, 382, 12, 11)}`;
  return sliceG(t, g, H, body, {
    title: `Contribution city ${need(WHEN[p], "phase word")}`,
    desc: cityAlt(calendar, profile.login),
    css: sc.css,
    defs: sc.defs,
    text: `~/contribution-city${counter}$ render-city --last 365d # one building per dayquietskyscraper`,
  });
}
