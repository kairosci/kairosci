import { z } from "zod";
import { need } from "./defined.ts";
import { countMapSchema, themesFileSchema } from "./schemas.ts";

export function short(n: number): string {
  const r = Number(n.toPrecision(3));
  const div = r >= 1e6 ? 1e6 : r >= 1e3 ? 1e3 : 1;
  const unit = r >= 1e6 ? "M" : r >= 1e3 ? "k" : "";
  return `${Number((r / div).toPrecision(3))}${unit}`;
}

export function monthDay(iso: string, long = false): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: long ? "long" : "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export const DAY = 864e5;
export const parse = (d: string): number => Date.parse(`${d}T00:00:00Z`);
export const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);
export const shift = (d: string, n: number): string => iso(parse(d) + n * DAY);
export const age = (from: string, to: string): number => Math.round((parse(to) - parse(from)) / DAY);

export function toolColor(
  t: z.infer<typeof themesFileSchema>["themes"][number],
  repo: string,
): string {
  const n = t.series.length - 1;
  if (n <= 0) return t.accent;
  let h = 0;
  for (const c of repo) h = (h * 31 + need(c.codePointAt(0), "codepoint")) >>> 0;
  return need(t.series[h % n], `series color ${h % n}`);
}

export function sum(
  daily: z.infer<typeof countMapSchema>,
  from: string,
  to: string,
): number {
  let n = 0;
  for (const entry of Object.entries(daily)) {
    if (entry[0] >= from && entry[0] <= to) n += need(entry[1], `count ${entry[0]}`);
  }
  return n;
}
