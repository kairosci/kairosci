import { z } from "zod";
import { f1 } from "../console.ts";
import { need } from "../defined.ts";
import { phaseSchema, skyBoxSchema, themeSchema } from "../schemas.ts";
import { render, themeVars } from "../templates.ts";
import { RAD } from "./sun.ts";

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
  return render("sky/sky-fade", {
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
    .map(([o, c, a]) => render("sky/sky-stop", { o, c, a }))
    .join("");
  const split = Math.floor(b.fade.x);
  const defs: string[] = [
    render("sky/sky-graddef", { top: b.top, horizon: b.horizon, stops }),
    fade("fadel", b.fade.left),
    fade("fader", b.fade.right),
    render("sky/sky-mask", {
      x0: b.x0,
      top: b.top,
      w: b.x1 - b.x0,
      h: b.bottom - b.top,
      w1: split + 2 - b.x0,
      split,
      w2: b.x1 - split,
    }),
    render("sky/defs-sunblur", { blur: BLUR }),
  ];
  const grad = render("sky/sky-grad", { x0: b.x0, top: b.top, w: b.x1 - b.x0, h: b.bottom - b.top });
  const sun: string[] = [];
  const css: string[] = [];
  if (p === "day") {
    const high = b.high;
    defs.push(render("sky/def-sunglow-day", { sun: SUN }));
    const rays = Array.from({ length: 12 }, (_, i) => {
      const a = i * 30 * RAD;
      const r0 = 21 * k;
      const r1 = (i % 2 ? 27 : 32) * k;
      return `M${f1(high[0] + Math.cos(a) * r0)} ${f1(high[1] + Math.sin(a) * r0)}L${f1(high[0] + Math.cos(a) * r1)} ${f1(high[1] + Math.sin(a) * r1)}`;
    }).join("");
    sun.push(
      render("sky/sun-day", {
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
    defs.push(render("sky/def-sunface", { top, bottom }));
    const reach = r + 3 * BLUR;
    const sunbars: [number, number][] = [
      [0.12, 0.07],
      [0.34, 0.1],
      [0.56, 0.13],
      [0.78, 0.16],
    ];
    const bars = sunbars
      .map(([by, bh]) =>
        render("sky/sunbar", {
          x: f1(low[0] - r),
          y: f1(low[1] + by * r),
          w: f1(2 * r),
          h: f1(bh * r),
        }),
      )
      .join("");
    defs.push(
      render("sky/def-slits", {
        x: f1(low[0] - reach),
        y: f1(low[1] - reach),
        w: f1(2 * reach),
        h: f1(2 * reach),
        bars,
      }),
    );
    sun.push(
      render("sky/sun-low", {
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
      const puffs = render("sky/cloud-puffs", {
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
      return render("sky/cloud", {
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
