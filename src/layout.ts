import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { z } from "zod";
import { geoSchema } from "./schemas.ts";

// Read the metrics of the same font embedded in the generated SVGs.
const font = await readFile("node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-800-normal.woff");
function table(tag: string): Buffer {
  for (let i = 0; i < font.readUInt16BE(12); i++) {
    const row = 44 + i * 20;
    if (font.toString("ascii", row, row + 4) !== tag) continue;
    const offset = font.readUInt32BE(row + 4);
    const length = font.readUInt32BE(row + 8);
    const data = font.subarray(offset, offset + length);
    return length === font.readUInt32BE(row + 12) ? data : inflateSync(data);
  }
  throw new Error(`missing font table ${tag}`);
}
const units = table("head").readUInt16BE(18);
const hhea = table("hhea");
const os2 = table("OS/2");
// Use the advance of the font's normal monospace glyphs, not a guessed ratio.
const hmtx = table("hmtx");
const advances = new Map<number, number>();
for (let i = 0; i < hhea.readUInt16BE(34); i++) {
  const advance = hmtx.readUInt16BE(i * 4);
  if (advance > 0) advances.set(advance, (advances.get(advance) ?? 0) + 1);
}
const monoAdvance = [...advances].sort((a, b) => b[1] - a[1])[0]?.[0];
if (monoAdvance === undefined) throw new Error("font has no horizontal metrics");
export const fontMetrics = {
  advance: monoAdvance / units,
  ascent: hhea.readInt16BE(4) / units,
  descent: -hhea.readInt16BE(6) / units,
  capitals: os2.readInt16BE(88) / units,
};
export const textWidth = (text: string, size: number, spacing = 0): number =>
  Array.from(text).length * (size * fontMetrics.advance + spacing);
export function fitText(text: string, width: number, size: number, spacing = 0): string {
  if (width <= 0) return "";
  if (textWidth(text, size, spacing) <= width) return text;
  const chars = Array.from(text);
  while (chars.length && textWidth(`${chars.join("").trimEnd()}…`, size, spacing) > width) chars.pop();
  return textWidth("…", size, spacing) <= width ? `${chars.join("").trimEnd()}…` : "";
}
export function wrapText(text: string, width: number, size: number): string[] {
  const capacity = Math.floor(width / textWidth("M", size));
  if (capacity < 1) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/u)) {
    if (!word) continue;
    const chars = Array.from(word);
    if (line && textWidth(`${line} ${word}`, size) > width) { lines.push(line); line = ""; }
    while (chars.length > capacity) {
      if (line) { lines.push(line); line = ""; }
      lines.push(chars.splice(0, capacity).join(""));
    }
    const tail = chars.join("");
    line = line ? `${line} ${tail}` : tail;
  }
  if (line) lines.push(line);
  return lines;
}
export function clampText(text: string, width: number, size: number, rows: number): string[] {
  if (rows <= 0) return [];
  const lines = wrapText(text, width, size);
  if (lines.length <= rows) return lines;
  return [...lines.slice(0, rows - 1), fitText(`${lines.slice(rows - 1).join(" ")}…`, width, size)];
}
export function nameLayout(text: string, width: number, top: number, bottom: number, inset: number) {
  const spacingRatio = fontMetrics.advance / 25;
  const size = Math.min(
    (width - inset * 2) / Math.max(Array.from(text).length * (fontMetrics.advance + spacingRatio), 1),
    (bottom - top) / (fontMetrics.capitals + fontMetrics.descent),
  );
  return { size, spacing: size * spacingRatio, baseline: top + ((bottom - top) + size * (fontMetrics.capitals - fontMetrics.descent)) / 2 };
}
export function cardLayout(g: z.infer<typeof geoSchema>, index: number, count: number, height: number) {
  if (!Number.isInteger(count) || count < 1 || index < 0 || index >= count) throw new Error("invalid card column");
  const segment = g.W / count;
  const gap = (g.X - g.FL) * fontMetrics.advance;
  const width = (g.R - g.X - gap * (count - 1)) / count;
  const x = g.X + index * (width + gap) - index * segment;
  const y = g.M * fontMetrics.advance;
  const padding = Math.min(g.X - g.FL, width / 8) / 2;
  const h = height - y * 2;
  const cut = Math.min(padding, h / 4);
  const right = index % 2 === 1;
  const box = right
    ? `M${x + cut} ${y}H${x + width}V${y + h - cut}L${x + width - cut} ${y + h}H${x}V${y + cut}Z`
    : `M${x} ${y}H${x + width - cut}L${x + width} ${y + cut}V${y + h}H${x + cut}L${x} ${y + h - cut}Z`;
  const cutLine = right ? `M${x} ${y + cut}L${x + cut} ${y}` : `M${x + width - cut} ${y}L${x + width} ${y + cut}`;
  return { x, y, width, height: h, padding, box, cutLine, left: x + padding, right: x + width - padding, top: y + padding, bottom: y + h - padding };
}
