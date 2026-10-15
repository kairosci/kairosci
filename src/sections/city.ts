import { createHash } from "node:crypto";
import { z } from "zod";
import { DESKTOP, FL, FR, PHONE, X, escapeMarkup, formatSvgNumber, formatNumber } from "../console.ts";
import { RenderContext } from "../ctx.ts";
import { first, need } from "../defined.ts";
import { calendarSchema, phaseSchema, skyBoxSchema, themeSchema } from "../schemas.ts";
import { formatMonthDay } from "../shared.ts";
import { SkyLayers, daylight, blendHexColors, colorForSkyPhase } from "../sky/layers.ts";
import { WHEN } from "../sky/sun.ts";

export const CITY_TILE_WIDTH = 25;
export const CITY_TILE_HEIGHT = 12.5;
export const CITY_ORIGIN_X = 152.5;
export const CITY_ORIGIN_Y = 262;
export const CITY_MAX_BUILDING_HEIGHT = 118;

export const formatSvgPoint = (x: number, y: number): string => `${formatSvgNumber(x)},${formatSvgNumber(y)}`;

export function* createDeterministicRandomSequence(seed: string): Generator<number> {
  let state = BigInt(`0x${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`);
  const mask = (1n << 64n) - 1n;
  while (true) {
    state = (state * 6364136223846793005n + 1442695040888963407n) & mask;
    yield Number(state >> 11n) / 2 ** 53;
  }
}

export function contributionCountThresholds(counts: number[]): number[] {
  const activeCounts = counts.filter((count) => count > 0).sort((a, b) => a - b);
  if (activeCounts.length === 0) return [1, 1, 1];
  const quartile = (fraction: number): number =>
    need(activeCounts[Math.min(activeCounts.length - 1, Math.floor(activeCounts.length * fraction))], "quartile");
  return [quartile(0.25), quartile(0.5), quartile(0.75)];
}

function desktopCityGeometry(): { tileWidth: number; tileHeight: number; originX: number; originY: number; maxBuildingHeight: number; s: number; windowScale: number; viewportWidth: number } {
  return { tileWidth: CITY_TILE_WIDTH, tileHeight: CITY_TILE_HEIGHT, originX: CITY_ORIGIN_X, originY: CITY_ORIGIN_Y, maxBuildingHeight: CITY_MAX_BUILDING_HEIGHT, s: 1, windowScale: 1, viewportWidth: DESKTOP.width };
}

const LIT = { night: 0.55, dawn: 0.2, day: 0.05, dusk: 0.24 };

function buildingFaceColors(theme: z.infer<typeof themeSchema>, phase: z.infer<typeof phaseSchema>): { left: string; right: string; offL: string; offR: string } {
  const city = theme.city;
  if (phase === "night") return { left: city.left, right: city.right, offL: city.winOff, offR: city.winOff };
  if (phase === "dawn") {
    return {
      left: blendHexColors(city.left, "#4b2a8a", 0.12),
      right: blendHexColors(city.right, "#ff7ab6", 0.1),
      offL: city.winOff,
      offR: blendHexColors(city.winOff, "#ff9ec7", 0.32),
    };
  }
  if (phase === "dusk") {
    return {
      left: blendHexColors(city.left, "#6a1b9a", 0.14),
      right: blendHexColors(city.right, "#ff9e3d", 0.12),
      offL: city.winOff,
      offR: blendHexColors(city.winOff, "#ff9e3d", 0.45),
    };
  }
  return {
    left: blendHexColors(city.left, daylight(theme), 0.1),
    right: blendHexColors(city.right, daylight(theme), 0.08),
    offL: blendHexColors(city.winOff, theme.accent, 0.14),
    offR: blendHexColors(city.winOff, theme.accent, 0.22),
  };
}

function calendarBuildingCells(calendar: z.infer<typeof calendarSchema>): { week: number; weekday: number; contributions: number }[] {
  const start = Date.parse(`${need(first(calendar, "calendar")[0], "first day")}T00:00:00Z`);
  return calendar
    .map((entry) => {
      const date = new Date(`${need(entry[0], "day")}T00:00:00Z`);
      const dayIndex = Math.round((date.getTime() - start) / 864e5);
      return { week: Math.floor(dayIndex / 7), weekday: date.getUTCDay(), contributions: need(entry[1], "count") };
    })
    .sort((a, b) => a.week + a.weekday - (b.week + b.weekday) || a.week - b.week);
}

function rankContributionCounts(counts: number[]): (count: number) => number {
  const activeCounts = counts.filter((count) => count > 0).sort((a, b) => a - b);
  return (count: number) => {
    const firstRank = activeCounts.indexOf(count);
    const lastRank = activeCounts.lastIndexOf(count);
    return activeCounts.length > 1 ? (firstRank + lastRank) / 2 / (activeCounts.length - 1) : 1;
  };
}

function summarizeContributionYear(calendar: z.infer<typeof calendarSchema>): { total: number; active: number; busiest: [string, number] } {
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

function calculateSkyFadeGeometry(city: { tileWidth: number; tileHeight: number; originX: number; originY: number; viewportWidth: number }): { x: number; left: number[]; right: number[] } {
  const originX = city.viewportWidth - city.originX;
  const originY = city.originY - city.tileHeight / 2;
  const tileDiagonal = Math.hypot(city.tileWidth, city.tileHeight);
  const nearDistance = (6 * city.tileWidth) / 25;
  const farDistance = (30 * city.tileWidth) / 25;
  const fadeLine = (normalX: number, normalY: number): number[] => [
    originX - normalX * nearDistance,
    originY - normalY * nearDistance,
    originX + normalX * farDistance,
    originY + normalY * farDistance,
  ];
  return {
    x: originX,
    left: fadeLine(-city.tileHeight / tileDiagonal, city.tileWidth / tileDiagonal),
    right: fadeLine(city.tileHeight / tileDiagonal, city.tileWidth / tileDiagonal),
  };
}

const formatSvgDecimal = (value: number): string => String(Number(value.toFixed(2)));

export class CitySection {
  private ctx: RenderContext;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
  }

  describeContributionCity(calendar: z.infer<typeof calendarSchema>): string {
    const stats = summarizeContributionYear(calendar);
    const sunPosition = this.ctx.sun.getCurrentSkyConditions();
    const timezone = this.ctx.profile.tz;
    const daysShown = Math.min(calendar.length, 365);
    return (
      `Contribution city: ${daysShown} buildings show daily GitHub contribution counts; taller, brighter buildings mark busier days. ${formatNumber(stats.total)} contributions in the last ${daysShown} days` +
      (stats.busiest[1] > 0 ? `; busiest day ${formatMonthDay(need(stats.busiest[0], "day"), true)} (${stats.busiest[1]}).` : ".") +
      ` Local sky in ${timezone}: ${need(WHEN[sunPosition.phase], "phase word")}; ${sunPosition.event} ${sunPosition.at}.`
    );
  }

  private renderContributionBuildings(
    calendar: z.infer<typeof calendarSchema>,
    next: () => number,
    g: { tileWidth: number; tileHeight: number; originX: number; originY: number; maxBuildingHeight: number; s: number; windowScale: number; viewportWidth: number },
    p: z.infer<typeof phaseSchema>,
  ): string {
    const t = this.ctx.theme;
    const engine = this.ctx.engine;
    const city = t.city;
    const face = buildingFaceColors(t, p);
    const days = calendar.slice(-365);
    const counts = days.map((entry) => need(entry[1], "count"));
    const contributionRank = rankContributionCounts(counts);
    const contributionThresholds = contributionCountThresholds(counts);
    const tileWidth = g.tileWidth;
    const tileHeight = g.tileHeight;
    const s = g.s;
    const windowScale = g.windowScale;
    const shapes: string[] = [];
    let flickerIndex = 0;
    for (const cell of calendarBuildingCells(calendar)) {
      const cx = g.viewportWidth - (g.originX + ((cell.week - cell.weekday) * tileWidth) / 2);
      const cy = g.originY + ((cell.week + cell.weekday) * tileHeight) / 2;
      const left: [number, number] = [cx - tileWidth / 2, cy];
      const right: [number, number] = [cx + tileWidth / 2, cy];
      const top: [number, number] = [cx, cy - tileHeight / 2];
      const bottom: [number, number] = [cx, cy + tileHeight / 2];
      if (cell.contributions === 0) {
        shapes.push(
          engine.render("city/city-empty", {
            d: `M${formatSvgPoint(top[0], top[1])}L${formatSvgPoint(right[0], right[1])}L${formatSvgPoint(bottom[0], bottom[1])}L${formatSvgPoint(left[0], left[1])}Z`,
            fill: city.empty,
            stroke: city.emptyStroke,
            sw: String(0.6 * s).replace(/^0\./, "."),
          }),
        );
        continue;
      }
      const buildingHeight = 8 * s + (g.maxBuildingHeight - 8 * s) * contributionRank(cell.contributions) ** 1.3;
      const roofLevel = contributionThresholds.filter((threshold) => cell.contributions > threshold).length;
      const raised: [number, number][] = [top, right, bottom, left].map(([x, y]) => [x, y - buildingHeight]);
      const up = {
        top: need(raised[0], "roof corner"),
        right: need(raised[1], "roof corner"),
        bottom: need(raised[2], "roof corner"),
        left: need(raised[3], "roof corner"),
      };
      const seamsLeft: string[] = [];
      const seamsRight: string[] = [];
      for (let floorHeight = 12 * s; floorHeight < buildingHeight - 3 * s; floorHeight += 12 * s) {
        seamsLeft.push(`M${formatSvgPoint(left[0], left[1] - floorHeight)}L${formatSvgPoint(bottom[0], bottom[1] - floorHeight)}`);
        seamsRight.push(`M${formatSvgPoint(bottom[0], bottom[1] - floorHeight)}L${formatSvgPoint(right[0], right[1] - floorHeight)}`);
      }
      shapes.push(
        engine.render("city/city-shadow", {
          d: [top, right, bottom, left].map(([x, y]) => formatSvgPoint(x + 4, y + 2)).join("L"),
        }) +
        engine.render("city/city-face", {
          dl: `M${formatSvgPoint(left[0], left[1])}L${formatSvgPoint(bottom[0], bottom[1])}L${formatSvgPoint(up.bottom[0], up.bottom[1])}L${formatSvgPoint(up.left[0], up.left[1])}Z`,
          dr: `M${formatSvgPoint(bottom[0], bottom[1])}L${formatSvgPoint(right[0], right[1])}L${formatSvgPoint(up.right[0], up.right[1])}L${formatSvgPoint(up.bottom[0], up.bottom[1])}Z`,
          left: face.left,
          right: face.right,
          edge: blendHexColors(t.bg, face.left, 0.35),
          seamsLeft: seamsLeft.join(""),
          seamsRight: seamsRight.join(""),
        }) +
          engine.render("city/city-roof", {
            d: `M${formatSvgPoint(up.top[0], up.top[1])}L${formatSvgPoint(up.right[0], up.right[1])}L${formatSvgPoint(up.bottom[0], up.bottom[1])}L${formatSvgPoint(up.left[0], up.left[1])}Z`,
            fill: need(city.roofs[roofLevel], "roof color"),
            edge: blendHexColors(t.bg, need(city.roofs[roofLevel], "roof edge color"), 0.45),
          }),
      );
      if ((cell.week * 3 + cell.weekday) % 5 === 0) {
        const unitX = cx - 1.2 * s;
        const unitY = cy - buildingHeight - 0.7 * s;
        const unitWidth = 8 * s;
        const unitDepth = 4 * s;
        const unitHeight = 3.8 * s;
        const leftTop: [number, number] = [unitX - unitWidth / 2, unitY - unitHeight];
        const frontTop: [number, number] = [unitX, unitY + unitDepth / 2 - unitHeight];
        const rightTop: [number, number] = [unitX + unitWidth / 2, unitY - unitHeight];
        const backTop: [number, number] = [unitX, unitY - unitDepth / 2 - unitHeight];
        shapes.push(engine.render("city/city-roof-unit", {
          left: formatSvgPoint(unitX - unitWidth / 2, unitY),
          front: formatSvgPoint(unitX, unitY + unitDepth / 2),
          right: formatSvgPoint(unitX + unitWidth / 2, unitY),
          leftTop: formatSvgPoint(...leftTop),
          frontTop: formatSvgPoint(...frontTop),
          rightTop: formatSvgPoint(...rightTop),
          backTop: formatSvgPoint(...backTop),
          leftColor: blendHexColors(t.bg, face.left, 0.72),
          rightColor: blendHexColors(t.bg, face.right, 0.7),
          topColor: need(city.roofs[roofLevel], "roof equipment color"),
          beaconX: formatSvgNumber(unitX),
          beaconY: formatSvgNumber(unitY - unitHeight),
          beaconR: formatSvgNumber(buildingHeight > g.maxBuildingHeight * 0.65 ? 0.65 * s : 0),
        }));
      }
      const windowDelay = -(((cell.week * 13 + cell.weekday * 7) % 110) / 10);
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
        for (let row = 0; row < Math.floor((buildingHeight - 6 * windowScale) / (7 * windowScale)); row++) {
          const v0 = (5 + row * 7) * windowScale;
          for (const u0 of [0.18, 0.58]) {
            const u = next();
            const litAtNight = u < LIT.night;
            if (!litAtNight && next() < 0.5) continue;
            const flickers = litAtNight && next() < 0.03;
            const corners: [number, number][] = [
              [u0, v0],
              [u0 + 0.26, v0],
              [u0 + 0.26, v0 + 3.2 * windowScale],
              [u0, v0 + 3.2 * windowScale],
            ];
            const pts = corners.map(([uu, vv]) =>
              formatSvgPoint(sideDef.a[0] + (sideDef.b[0] - sideDef.a[0]) * uu, sideDef.a[1] + (sideDef.b[1] - sideDef.a[1]) * uu - vv),
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
        if (offL.length + offR.length > 0) shapes.push(engine.render("city/city-win", { d: [...offL, ...offR].join(""), fill: face.offL, delay: windowDelay }));
      } else {
        if (offL.length > 0) shapes.push(engine.render("city/city-win", { d: offL.join(""), fill: face.offL, delay: windowDelay }));
        if (offR.length > 0) shapes.push(engine.render("city/city-win", { d: offR.join(""), fill: face.offR, delay: windowDelay - 2.7 }));
      }
      if (on.length > 0) shapes.push(engine.render("city/city-win", { d: on.join(""), fill: city.winOn, delay: windowDelay - 1.3 }));
      if (side.length > 0) shapes.push(engine.render("city/city-win", { d: side.join(""), fill: city.winSide, delay: windowDelay - 4.1 }));
      for (const flicker of fl) {
        flickerIndex++;
        shapes.push(
          engine.render("city/city-flicker", {
            d: need(flicker[0], "window"),
            fill: need(flicker[1], "window face") === "l" ? city.winOn : city.winSide,
            cls: `f${flickerIndex % 3}`,
          }),
        );
      }
    }
    return shapes.join("");
  }

  private renderSkyStars(
    next: () => number,
    field: { x0: number; w: number; y0: number; h: number; n: number; skip: (x: number, y: number) => boolean },
    p: z.infer<typeof phaseSchema>,
  ): string {
    const t = this.ctx.theme;
    const engine = this.ctx.engine;
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
        x: formatSvgNumber(x),
        y: formatSvgNumber(y),
        r: need(sizes[i % 3], "star size"),
        fill: t.city.sky,
        opacity: (p === "night" ? o : o * 0.7).toFixed(2),
      };
      if (i % 3 === 0) out.push(engine.render("city/star-tileWidth", { ...vars, cls: `s${i % 3}` }));
      else out.push(engine.render("city/star", vars));
    }
    return engine.render("console/fade-group", { delay: "0.00", inner: out.join("") });
  }

  private renderMoon(centerX: number, centerY: number, scale: number): string {
    const theme = this.ctx.theme;
    return this.ctx.engine.render("city/moon", {
      cx: centerX,
      cy: centerY,
      glowR: formatSvgDecimal(40 * scale),
      faceR: formatSvgDecimal(14 * scale),
      moon: theme.moon,
      shadeX: formatSvgDecimal(centerX + 6 * scale),
      shadeY: formatSvgDecimal(centerY - 5 * scale),
      shadeR: formatSvgDecimal(12.5 * scale),
      bg: theme.bg,
    });
  }

  private renderPassingPlane(y: number): string {
    return this.ctx.engine.render("city/plane", { y, fainter: this.ctx.theme.fainter });
  }

  private composeSkyScene(
    p: z.infer<typeof phaseSchema>,
    box: z.infer<typeof skyBoxSchema>,
    frame: { x: number; w: number; h: number },
  ): { css: string; defs: string; under: (stars: string) => string } {
    const t = this.ctx.theme;
    const engine = this.ctx.engine;
    const css = [
      engine.render("css/scene", { down: frame.x - 10, up: frame.x + frame.w + 70 }),
    ];
    const defs = [
      engine.render("sky/defs-frame", { x: frame.x, w: frame.w, h: frame.h }),
      engine.render("city/city-materials", {}),
    ];
    if (p === "night") {
      defs.push(engine.render("sky/defs-moonglow", { moon: t.moon }));
      return {
        css: css.join("\n"),
        defs: defs.join("\n"),
        under: (stars: string) => `${stars}\n${this.renderMoon(need(box.high[0], "moon x"), need(box.high[1], "moon y"), box.k)}`,
      };
    }
    const layer = new SkyLayers(engine, t).buildSkyLayer(p, box);
    css.push(layer.css);
    defs.push(layer.defs);
    return {
      css: css.join("\n"),
      defs: defs.join("\n"),
      under: (stars: string) => `${layer.grad}\n${stars}\n${engine.render("console/fade-group", { delay: "0.00", inner: `${layer.sun}\n${layer.clouds}` })}`,
    };
  }

  private renderSkyReadout(x: number, y: number, size: number, anchor: "start" | "end"): string {
    const s = this.ctx.sun.getCurrentSkyConditions();
    const vars = {
      x,
      y,
      size,
      phase: s.phase,
      color: colorForSkyPhase(this.ctx.theme, s.phase),
      event: s.event,
      at: escapeMarkup(s.at),
    };
    if (anchor === "end") return this.ctx.engine.render("city/readout-end", vars);
    return this.ctx.engine.render("city/readout-start", vars);
  }

  private renderContributionLegendRow(x: number, y: number, size: number, sw: number): string {
    const city = this.ctx.theme.city;
    const cw = size * 0.6;
    const x0 = x + 5 * cw + 7;
    const fills = [city.empty, ...city.roofs];
    const swatches = fills
      .map((c, i) => this.ctx.engine.render("city/city-sw", { x: formatSvgNumber(x0 + i * (sw + 5)), y: formatSvgNumber(y - sw + 1), sw, fill: c }))
      .join("");
    return this.ctx.engine.render("city/city-legend", { x, y, size, swatches, x2: formatSvgNumber(x0 + 5 * (sw + 5) + 1) });
  }

  async renderDesktopCity(calendar: z.infer<typeof calendarSchema>, updated: string, counter: string): Promise<string> {
    const { engine, theme } = this.ctx;
    const slices = this.ctx.slices;
    const city = theme.city;
    const p = this.ctx.sun.getCurrentSkyConditions().phase;
    const days = calendar.slice(-365);
    const counts = days.map((entry) => need(entry[1], "count"));
    const total = counts.reduce((a, b) => a + b, 0);
    const randomValues = createDeterministicRandomSequence(`${updated}-${total}`);
    const nextRandomValue = (): number => need(randomValues.next().value, "random value");
    const desktopGeometry = desktopCityGeometry();
    const buildingShapes = this.renderContributionBuildings(days, nextRandomValue, desktopGeometry, p);

    const skyScene = this.composeSkyScene(
      p,
      {
        x0: FL,
        x1: FR,
        top: 62,
        horizon: 600,
        bottom: 680,
        fade: calculateSkyFadeGeometry(desktopGeometry),
        high: [FR - 96, 142],
        low: [FR - 86, 486],
        k: 1,
        clouds: [
          [390, 152, 0.9],
          [548, 222, 0.75],
        ],
        drift: 40,
      },
      { x: FL, w: FR - FL, h: 680 },
    );
    const stars = this.renderSkyStars(nextRandomValue, { x0: 470, w: 350, y0: 118, h: 150, n: 46, skip: (x, y) => x > 700 && y < 215 }, p);
    const yearSummary = summarizeContributionYear(calendar);
    const busiestDay = yearSummary.busiest;
    const infoParts: string[] = [
      engine.render("city/city-info-total", { x: X, y: 112, total: formatNumber(yearSummary.total) }),
    ];
    if (busiestDay[1] > 0) {
      infoParts.push(engine.render("city/city-info-busiest", { x: X, y: 132, date: formatMonthDay(need(busiestDay[0], "day")), count: busiestDay[1] }));
    }
    infoParts.push(engine.render("city/city-info-active", { x: X, y: busiestDay[1] > 0 ? 152 : 132, count: yearSummary.active }));
    const legend = [city.empty, ...city.roofs]
      .map((color, index) => engine.render("city/city-sw", { x: X + 52 + index * 16, y: 642, sw: 11, fill: color }))
      .join("");
    const body =
      `${slices.renderSectionHeading(DESKTOP, 44, "contribution-city", counter)}\n` +
      `${slices.renderCommandPrompt(DESKTOP, "render-city --last 365d", 0.15, "# one building per day")}\n` +
      `${skyScene.under(stars)}\n` +
      `${this.renderPassingPlane(132)}\n` +
      `${infoParts.join("\n")}\n` +
      `${buildingShapes}\n` +
      engine.render("city/city-legend", { x: X, y: 652, size: 11, swatches: legend, x2: X + 52 + 5 * 16 + 6 }) +
      `\n${this.renderSkyReadout(FR - 36, 652, 11, "end")}`;
    return slices.createSvgSlice(DESKTOP, 680, body, {
      title: `Contribution city ${need(WHEN[p], "phase word")}`,
      desc: this.describeContributionCity(calendar),
      css: skyScene.css,
      defs: skyScene.defs,
      text: `~/contribution-city${counter}$ render-city --last 365d # one building per dayquietskyscraper`,
    });
  }

  async renderPhoneCity(calendar: z.infer<typeof calendarSchema>, updated: string, counter: string): Promise<string> {
    const { engine } = this.ctx;
    const slices = this.ctx.slices;
    const g = PHONE;
    const p = this.ctx.sun.getCurrentSkyConditions().phase;
    const days = calendar.slice(-365);
    const counts = days.map((entry) => need(entry[1], "count"));
    const total = counts.reduce((a, b) => a + b, 0);
    const randomValues = createDeterministicRandomSequence(`${updated}-${total}`);
    const nextRandomValue = (): number => need(randomValues.next().value, "random value");
    const phoneIso = { tileWidth: 13, tileHeight: 6.5, originX: 67.5, originY: 180, maxBuildingHeight: 68, s: 0.52, windowScale: 0.7, viewportWidth: g.width };
    const buildingShapes = this.renderContributionBuildings(days, nextRandomValue, phoneIso, p);
    const phoneHeight = 400;
    const skyScene = this.composeSkyScene(
      p,
      {
        x0: g.frameLeft,
        x1: g.frameRight,
        top: 62,
        horizon: 340,
        bottom: phoneHeight,
        fade: calculateSkyFadeGeometry(phoneIso),
        high: [g.frameRight - 34, 134],
        low: [g.frameRight - 30, 286],
        k: 0.6,
        clouds: [
          [235, 102, 0.62],
          [286, 132, 0.48],
        ],
        drift: 22,
      },
      { x: g.frameLeft, w: g.frameRight - g.frameLeft, h: phoneHeight },
    );
    const stars = this.renderSkyStars(nextRandomValue, { x0: 150, w: 270, y0: 104, h: 110, n: 34, skip: (x, y) => x > 340 && y < 168 }, p);
    const yearSummary = summarizeContributionYear(calendar);
    const busiestDay = yearSummary.busiest;
    const infoParts: string[] = [engine.render("city/city-pinfo-total", { x: g.contentLeft, y: 112, total: formatNumber(yearSummary.total) })];
    if (busiestDay[1] > 0) {
      infoParts.push(
        engine.render("city/city-pinfo-busiest", { x: g.contentLeft, y: 130, date: formatMonthDay(need(busiestDay[0], "day")), count: busiestDay[1] }),
      );
    }
    infoParts.push(
      engine.render("city/city-pinfo-active", { x: g.contentLeft, y: busiestDay[1] > 0 ? 148 : 130, count: yearSummary.active }),
    );
    const body =
      `${slices.renderSectionHeading(g, 44, "contribution-city", counter)}\n` +
      `${slices.renderCommandPrompt(g, "render-city --last 365d", 0.15, "# one building per day", 90, 13)}\n` +
      `${skyScene.under(stars)}\n` +
      `${this.renderPassingPlane(120)}\n` +
      `${buildingShapes}\n` +
      `${infoParts.join("\n")}\n` +
      `${this.renderSkyReadout(g.contentRight, 356, 12, "end")}\n` +
      `${this.renderContributionLegendRow(g.contentLeft, 382, 12, 11)}`;
    return slices.createSvgSlice(g, phoneHeight, body, {
      title: `Contribution city ${need(WHEN[p], "phase word")}`,
      desc: this.describeContributionCity(calendar),
      css: skyScene.css,
      defs: skyScene.defs,
      text: `~/contribution-city${counter}$ render-city --last 365d # one building per dayquietskyscraper`,
    });
  }
}
