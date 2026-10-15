import { z } from "zod";
import { need } from "./defined.ts";
import { countMapSchema, themesFileSchema } from "./schemas.ts";

export function formatCompactNumber(value: number): string {
  const roundedValue = Number(value.toPrecision(3));
  const divisor = roundedValue >= 1e6 ? 1e6 : roundedValue >= 1e3 ? 1e3 : 1;
  const suffix = roundedValue >= 1e6 ? "M" : roundedValue >= 1e3 ? "k" : "";
  return `${Number((roundedValue / divisor).toPrecision(3))}${suffix}`;
}

export function formatMonthDay(isoDate: string, long = false): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    month: long ? "long" : "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export const MILLISECONDS_PER_DAY = 864e5;
export const parseIsoDateAsUtcMilliseconds = (isoDate: string): number => Date.parse(`${isoDate}T00:00:00Z`);
export const formatUtcMillisecondsAsIsoDate = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10);
export const shiftIsoDateByDays = (isoDate: string, dayOffset: number): string =>
  formatUtcMillisecondsAsIsoDate(parseIsoDateAsUtcMilliseconds(isoDate) + dayOffset * MILLISECONDS_PER_DAY);
export const countDaysBetweenIsoDates = (fromDate: string, toDate: string): number =>
  Math.round((parseIsoDateAsUtcMilliseconds(toDate) - parseIsoDateAsUtcMilliseconds(fromDate)) / MILLISECONDS_PER_DAY);

export function colorForRepository(
  theme: z.infer<typeof themesFileSchema>["themes"][number],
  repositoryName: string,
): string {
  const availableColors = theme.series.length - 1;
  if (availableColors <= 0) return theme.accent;
  let colorHash = 0;
  for (const character of repositoryName) colorHash = (colorHash * 31 + need(character.codePointAt(0), "codepoint")) >>> 0;
  return need(theme.series[colorHash % availableColors], `series color ${colorHash % availableColors}`);
}

export function sumDailyContributionCounts(
  dailyCounts: z.infer<typeof countMapSchema>,
  from: string,
  to: string,
): number {
  let total = 0;
  for (const entry of Object.entries(dailyCounts)) {
    if (entry[0] >= from && entry[0] <= to) total += need(entry[1], `count ${entry[0]}`);
  }
  return total;
}
