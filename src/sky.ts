import { z } from "zod";
import { f1 } from "./console.ts";
import { need } from "./defined.ts";
import { phaseSchema, skyBoxSchema, skySchema, themeSchema } from "./schemas.ts";
import { render, themeVars } from "./templates.ts";

let geoLat = 0;
let geoLon = 0;
let dateFmt: Intl.DateTimeFormat | null = null;
let timeFmt: Intl.DateTimeFormat | null = null;

export function configureSky(lat: number, lon: number, tz: string): void {
  geoLat = lat;
  geoLon = lon;
  dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  });
}

const DAWN_BEFORE = 45;
const DAWN_AFTER = 45;
const DUSK_BEFORE = 60;
const DUSK_AFTER = 45;

const RAD = Math.PI / 180;
const MIN = 6e4;

export function sunTimes(y: number, m: number, d: number): { rise: number; set: number } {
  const day0 = Date.UTC(y, m - 1, d);
  const doy = (day0 - Date.UTC(y, 0, 1)) / 864e5 + 1;
  const len = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 864e5;
  const g = ((2 * Math.PI) / len) * (doy - 1);
  const eqt =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const ha =
    Math.acos(
      Math.cos(90.833 * RAD) / (Math.cos(geoLat * RAD) * Math.cos(decl)) -
        Math.tan(geoLat * RAD) * Math.tan(decl),
    ) / RAD;
  return {
    rise: day0 + (720 - 4 * (geoLon + ha) - eqt) * MIN,
    set: day0 + (720 - 4 * (geoLon - ha) - eqt) * MIN,
  };
}

function clock(ms: number): string {
  const fmt = need(timeFmt, "sky timezone");
  const parts = new Map<string, string>();
  for (const part of fmt.formatToParts(Math.round(ms / MIN) * MIN)) parts.set(part.type, part.value);
  return `${need(parts.get("hour"), "hour")}:${need(parts.get("minute"), "minute")} ${need(parts.get("timeZoneName"), "tz name")}`;
}

function splitDate(formatted: string): [number, number, number] {
  const nums = formatted.split("-").map(Number);
  return [need(nums[0], "year"), need(nums[1], "month"), need(nums[2], "day")];
}

export function skyAt(now: number): z.infer<typeof skySchema> {
  const fmt = need(dateFmt, "sky timezone");
  const [y, m, d] = splitDate(fmt.format(now));
  const times = sunTimes(y, m, d);
  if (now < times.rise - DAWN_BEFORE * MIN) return { phase: "night", event: "sunrise", at: clock(times.rise) };
  if (now < times.rise + DAWN_AFTER * MIN) return { phase: "dawn", event: "sunrise", at: clock(times.rise) };
  if (now < times.set - DUSK_BEFORE * MIN) return { phase: "day", event: "sunset", at: clock(times.set) };
  if (now < times.set + DUSK_AFTER * MIN) return { phase: "dusk", event: "sunset", at: clock(times.set) };
  const [ty, tm, td] = splitDate(fmt.format(Date.UTC(y, m - 1, d + 1, 12)));
  return { phase: "night", event: "sunrise", at: clock(sunTimes(ty, tm, td).rise) };
}

let current: z.infer<typeof skySchema> | null = null;
export function sky(): z.infer<typeof skySchema> {
  if (current === null) {
    const env = process.env["PROFILE_NOW"];
    const now = env === undefined ? Date.now() : Date.parse(env);
    if (Number.isNaN(now)) throw new Error(`PROFILE_NOW is not a timestamp: ${env}`);
    current = skyAt(now);
  }
  return current;
}

export const WHEN = { night: "at night", dawn: "at dawn", day: "by day", dusk: "at dusk" };

export function mix(a: string, b: string, k: number): string {
  const rgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const xa = rgb(a);
  const xb = rgb(b);
  return `#${xa.map((v, i) => Math.round(v + (need(xb[i], "channel") - v) * k).toString(16).padStart(2, "0")).join("")}`;
}

const BLUR = 4;
const SUN = "#ffd36e";
const SUN_CORE = "#fff6d8";
const GRADIENTS = {
  dawn: (): [number, string, number][] => [
    [0, "#2b1a5e", 0],
    [0.4, "#4b2a8a", 0.2],
    [0.72, "#ff7ab6", 0.2],
    [1, "#ffb877", 0.36],
  ],
  day: (t: z.infer<typeof themeSchema>): [number, string, number][] => [
    [0, need(t.city.roofs[1], "roof"), 0],
    [0.2, need(t.city.roofs[1], "roof"), 0.08],
    [0.5, need(t.city.roofs[2], "roof"), 0.16],
    [1, t.accent, 0.3],
  ],
  dusk: (t: z.infer<typeof themeSchema>): [number, string, number][] => [
    [0, "#2a0f4a", 0],
    [0.38, "#6a1b9a", 0.26],
    [0.7, t.accent2, 0.22],
    [1, "#ff9e3d", 0.42],
  ],
};
const FACES = { dawn: ["#fff1c1", "#ff7ab6"], dusk: ["#ffe27a", "#ff2bd6"] };
const CLOUDS = {
  dawn: (t: z.infer<typeof themeSchema>): [string, string] => ["#ff9ec7", mix(t.bg, "#ff9ec7", 0.16)],
  day: (t: z.infer<typeof themeSchema>): [string, string] => [t.accent, mix(t.bg, daylight(t), 0.2)],
  dusk: (t: z.infer<typeof themeSchema>): [string, string] => ["#ff9e3d", mix(t.bg, "#ff7ab6", 0.18)],
};
export const daylight = (t: z.infer<typeof themeSchema>): string => mix(t.accent, "#ffffff", 0.5);
export function phaseColor(t: z.infer<typeof themeSchema>, p: z.infer<typeof phaseSchema>): string {
  if (p === "night") return t.moon;
  if (p === "dawn") return "#ff9ec7";
  if (p === "day") return SUN;
  return "#ff9e3d";
}

function fade(id: string, v: number[]): string {
  return render("sky-fade", {
    id,
    x1: f1(need(v[0], "fade x1")),
    y1: f1(need(v[1], "fade y1")),
    x2: f1(need(v[2], "fade x2")),
    y2: f1(need(v[3], "fade y2")),
  });
}

export function skyLayer(
  t: z.infer<typeof themeSchema>,
  p: Exclude<z.infer<typeof phaseSchema>, "night">,
  b: z.infer<typeof skyBoxSchema>,
): { defs: string; css: string; grad: string; sun: string; clouds: string } {
  const k = b.k;
  const stops = GRADIENTS[p](t)
    .map(([o, c, a]) => render("sky-stop", { o, c, a }))
    .join("");
  const split = Math.floor(b.fade.x);
  const defs: string[] = [
    render("sky-graddef", { top: b.top, horizon: b.horizon, stops }),
    fade("fadel", b.fade.left),
    fade("fader", b.fade.right),
    render("sky-mask", {
      x0: b.x0,
      top: b.top,
      w: b.x1 - b.x0,
      h: b.bottom - b.top,
      w1: split + 2 - b.x0,
      split,
      w2: b.x1 - split,
    }),
    render("defs-sunblur", { blur: BLUR }),
  ];
  const grad = render("sky-grad", { x0: b.x0, top: b.top, w: b.x1 - b.x0, h: b.bottom - b.top });
  const sun: string[] = [];
  const css: string[] = [];
  if (p === "day") {
    const high = b.high;
    defs.push(render("def-sunglow-day", { sun: SUN }));
    const rays = Array.from({ length: 12 }, (_, i) => {
      const a = i * 30 * RAD;
      const r0 = 21 * k;
      const r1 = (i % 2 ? 27 : 32) * k;
      return `M${f1(high[0] + Math.cos(a) * r0)} ${f1(high[1] + Math.sin(a) * r0)}L${f1(high[0] + Math.cos(a) * r1)} ${f1(high[1] + Math.sin(a) * r1)}`;
    }).join("");
    sun.push(
      render("sun-day", {
        ...themeVars(t),
        cx: high[0],
        cy: high[1],
        glowR: f1(74 * k),
        rays,
        rayW: f1(2 * k),
        sun: SUN,
        sunCore: SUN_CORE,
        r: f1(15 * k),
      }),
    );
    css.push(
      `@keyframes spin{to{transform:rotate(360deg)}}`,
      `.rays{transform-origin:${high[0]}px ${high[1]}px;animation:spin 80s linear infinite}`,
    );
  } else {
    const low = b.low;
    const r = 24 * k;
    const face = FACES[p];
    const top = need(face[0], "sun top");
    const bottom = need(face[1], "sun bottom");
    defs.push(render("def-sunface", { top, bottom }));
    const reach = r + 3 * BLUR;
    const sunbars: [number, number][] = [
      [0.12, 0.07],
      [0.34, 0.1],
      [0.56, 0.13],
      [0.78, 0.16],
    ];
    const bars = sunbars
      .map(([by, bh]) =>
        render("sunbar", {
          x: f1(low[0] - r),
          y: f1(low[1] + by * r),
          w: f1(2 * r),
          h: f1(bh * r),
        }),
      )
      .join("");
    defs.push(
      render("def-slits", {
        x: f1(low[0] - reach),
        y: f1(low[1] - reach),
        w: f1(2 * reach),
        h: f1(2 * reach),
        bars,
      }),
    );
    sun.push(
      render("sun-low", {
        ...themeVars(t),
        cx: low[0],
        cy: low[1],
        glowR: f1(96 * k),
        faceR: f1(r),
        bottom,
      }),
    );
  }
  const cloudsDef = CLOUDS[p](t);
  const rim = need(cloudsDef[0], "cloud rim");
  const fill = need(cloudsDef[1], "cloud fill");
  const clouds = b.clouds
    .map(([x, y, s], i) => {
      const u = s * k;
      const puffs = render("cloud-puffs", {
        x: f1(x),
        y: f1(y),
        w: f1(66 * u),
        h: f1(12 * u),
        rx: f1(6 * u),
        c1x: f1(x + 20 * u),
        c1y: f1(y + 2 * u),
        c1r: f1(9 * u),
        c2x: f1(x + 36 * u),
        c2y: f1(y - 2 * u),
        c2r: f1(12 * u),
        c3x: f1(x + 52 * u),
        c3y: f1(y + 3 * u),
        c3r: f1(7 * u),
      });
      return render("cloud", {
        ...themeVars(t),
        i,
        rim,
        rimW1: f1(4 * k),
        rimW2: f1(2.4 * k),
        fill,
        puffs,
      });
    })
    .join("");
  css.push(
    `@keyframes drift{from{transform:translateX(${-b.drift}px)}to{transform:translateX(${b.drift}px)}}`,
    `.c0{animation:drift 70s ease-in-out infinite alternate}.c1{animation:drift 95s ease-in-out infinite alternate-reverse}.c2{animation:drift 120s ease-in-out infinite alternate}`,
  );
  return { defs: defs.join("\n"), css: css.join("\n"), grad, sun: sun.join("\n"), clouds };
}
