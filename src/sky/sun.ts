import { z } from "zod";
import { need } from "../defined.ts";
import { skySchema } from "../schemas.ts";

export const RAD = Math.PI / 180;
const MIN = 6e4;
const DAWN_BEFORE = 45;
const DAWN_AFTER = 45;
const DUSK_BEFORE = 60;
const DUSK_AFTER = 45;

export const WHEN = { night: "at night", dawn: "at dawn", day: "by day", dusk: "at dusk" };

function splitDate(formatted: string): [number, number, number] {
  const nums = formatted.split("-").map(Number);
  return [need(nums[0], "year"), need(nums[1], "month"), need(nums[2], "day")];
}

export class SunCalc {
  private dateFmt: Intl.DateTimeFormat;
  private timeFmt: Intl.DateTimeFormat;
  private current: z.infer<typeof skySchema> | null = null;
  private lat: number;
  private lon: number;

  constructor(lat: number, lon: number, tz: string) {
    this.lat = lat;
    this.lon = lon;
    this.dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    this.timeFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    });
  }

  calculateSunriseAndSunset(y: number, m: number, d: number): { rise: number; set: number } {
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
        Math.cos(90.833 * RAD) / (Math.cos(this.lat * RAD) * Math.cos(decl)) -
          Math.tan(this.lat * RAD) * Math.tan(decl),
      ) / RAD;
    return {
      rise: day0 + (720 - 4 * (this.lon + ha) - eqt) * MIN,
      set: day0 + (720 - 4 * (this.lon - ha) - eqt) * MIN,
    };
  }

  private formatLocalSunEventTime(timestamp: number): string {
    const parts = new Map<string, string>();
    const fiveMinutes = 5 * MIN;
    for (const part of this.timeFmt.formatToParts(Math.round(timestamp / fiveMinutes) * fiveMinutes)) {
      parts.set(part.type, part.value);
    }
    return `~${need(parts.get("hour"), "hour")}:${need(parts.get("minute"), "minute")} ${need(parts.get("timeZoneName"), "tz name")}`;
  }

  getSkyConditionsAt(timestamp: number): z.infer<typeof skySchema> {
    const [year, month, day] = splitDate(this.dateFmt.format(timestamp));
    const times = this.calculateSunriseAndSunset(year, month, day);
    if (timestamp < times.rise - DAWN_BEFORE * MIN) return { phase: "night", event: "sunrise", at: this.formatLocalSunEventTime(times.rise) };
    if (timestamp < times.rise + DAWN_AFTER * MIN) return { phase: "dawn", event: "sunrise", at: this.formatLocalSunEventTime(times.rise) };
    if (timestamp < times.set - DUSK_BEFORE * MIN) return { phase: "day", event: "sunset", at: this.formatLocalSunEventTime(times.set) };
    if (timestamp < times.set + DUSK_AFTER * MIN) return { phase: "dusk", event: "sunset", at: this.formatLocalSunEventTime(times.set) };
    const [tomorrowYear, tomorrowMonth, tomorrowDay] = splitDate(this.dateFmt.format(Date.UTC(year, month - 1, day + 1, 12)));
    return {
      phase: "night",
      event: "sunrise",
      at: this.formatLocalSunEventTime(this.calculateSunriseAndSunset(tomorrowYear, tomorrowMonth, tomorrowDay).rise),
    };
  }

  getCurrentSkyConditions(): z.infer<typeof skySchema> {
    if (this.current === null) {
      const env = process.env["PROFILE_NOW"];
      const stamp = env === undefined ? Date.now() : Date.parse(env);
      if (Number.isNaN(stamp)) throw new Error(`PROFILE_NOW is not a timestamp: ${env}`);
      this.current = this.getSkyConditionsAt(stamp);
    }
    return this.current;
  }
}
