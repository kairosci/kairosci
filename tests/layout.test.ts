import assert from "node:assert/strict";
import { test } from "node:test";
import { DESKTOP, PHONE } from "../src/console.ts";
import { cardLayout, clampText, fitText, fontMetrics, nameLayout, textWidth, wrapText } from "../src/layout.ts";
import { readFile } from "node:fs/promises";
import { RenderContext } from "../src/ctx.ts";
import { loadProfile, loadTheme } from "../src/profile.ts";
import { snapshotSchema } from "../src/schemas.ts";
import { Buttons, HeaderSection } from "../src/sections/frame.ts";
import { ProjectsSection } from "../src/sections/projects.ts";
import { TemplateEngine } from "../src/templates.ts";

test("all card columns stay inside the content borders and share the same gap", () => {
  for (const g of [DESKTOP, PHONE]) for (const count of [1, 2, 3, 4]) {
    let previousRight = g.X;
    for (let i = 0; i < count; i++) {
      const c = cardLayout(g, i, count, 200);
      const left = c.x + i * g.W / count;
      assert.ok(c.width > 0 && c.height > 0);
      assert.ok(left >= g.X - 1e-9);
      assert.ok(left + c.width <= g.R + 1e-9);
      assert.ok(c.y >= 0 && c.y + c.height <= 200);
      if (i) assert.ok(Math.abs(left - previousRight - (g.X - g.FL) * fontMetrics.advance) < 1e-9);
      previousRight = left + c.width;
    }
  }
});

test("name sizing is derived from both available width and vertical space", () => {
  for (const text of ["A", "ALESSIO ATTILIO", "A VERY LONG NAME ".repeat(10)]) for (const width of [160, 384, 776]) {
    const box = nameLayout(text, width, 100, 180, 6);
    assert.ok(textWidth(text, box.size, box.spacing) + 12 <= width + 1e-9);
    assert.ok(box.baseline - box.size * fontMetrics.capitals >= 100 - 1e-9);
    assert.ok(box.baseline + box.size * fontMetrics.descent <= 180 + 1e-9);
  }
});

test("wrapping and truncation handle long words, Unicode and tiny widths", () => {
  for (const text of ["short", "longword".repeat(30), "😀 Unicode and spaces ".repeat(30)]) for (const width of [1, 8, 40, 180, 340]) {
    assert.ok(textWidth(fitText(text, width, 12), 12) <= width + 1e-9);
    for (const line of wrapText(text, width, 12)) assert.ok(textWidth(line, 12) <= width + 1e-9);
    const lines = clampText(text, width, 12, 3);
    assert.ok(lines.length <= 3);
    for (const line of lines) assert.ok(textWidth(line, 12) <= width + 1e-9);
  }
});

function assertCardTextFits(svg: string, card: ReturnType<typeof cardLayout>): void {
  for (const match of svg.matchAll(/<text ([^>]+)>([\s\S]*?)<\/text>/g)) {
    const attrs = match[1] ?? "";
    const size = Number(attrs.match(/font-size:([\d.]+)px/)?.[1]);
    if (!size) continue;
    const text = (match[2] ?? "").replace(/<[^>]+>/g, "").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
    const width = textWidth(text, size, Number(attrs.match(/letter-spacing="([\d.]+)"/)?.[1] ?? 0));
    let x = Number(attrs.match(/(?:^| )x="([\d.]+)"/)?.[1]);
    const y = Number(attrs.match(/(?:^| )y="([\d.]+)"/)?.[1]);
    if (attrs.includes('text-anchor="end"')) x -= width;
    if (attrs.includes('text-anchor="middle"')) x -= width / 2;
    assert.ok(x >= card.left - 1e-9, `text starts outside card: ${text}`);
    assert.ok(x + width <= card.right + 1e-9, `text ends outside card: ${text}`);
    assert.ok(y - size * fontMetrics.capitals >= card.y - 1e-9, `text above card: ${text}`);
    assert.ok(y + size * fontMetrics.descent <= card.bottom + 1e-9, `text below card: ${text}`);
  }
}

function assertProjectArrowClearsName(svg: string): void {
  const text = [...svg.matchAll(/<text x="([\d.]+)" y="[\d.]+"[^>]*style="font-size:([\d.]+)px">([^<]*)<\/text>/g)]
    .find((match) => match[0].includes("font-weight=\"700\""));
  const arrow = svg.match(/<path d="M([\d.]+) [\d.]+l7-7/);
  assert.ok(text && arrow, "project name and arrow are rendered");
  const name = (text[3] ?? "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const nameRight = Number(text[1]) + textWidth(name, Number(text[2]));
  assert.ok(Number(arrow[1]) >= nameRight + 5.9, "project arrow has a visible gap after its name");
}

test("shared card renderer supports long content and single-column links without invalid SVG", async () => {
  const engine = new TemplateEngine();
  await engine.load("templates");
  const profile = await loadProfile();
  const snapshot = snapshotSchema.parse(JSON.parse(await readFile("data/snapshot.json", "utf8")));
  const ctx = new RenderContext(engine, await loadTheme("reef"), snapshot, profile);
  const buttons = new Buttons(ctx);
  const b = { label: "label".repeat(100), handle: "handle".repeat(100), url: "https://example.com", icon: "" };
  for (const n of [1, 2, 4]) for (let k = 0; k < n; k++) for (const svg of await Promise.all([
    buttons.button(b, k, n), buttons.phoneButton(b, k, n),
  ]).then((svgs) => svgs.map((svg, i) => ({ svg, g: i === 0 ? DESKTOP : PHONE })))) {
    assert.doesNotMatch(svg.svg, /NaN|Infinity|\{\{/);
    assertCardTextFits(svg.svg, cardLayout(svg.g, k, n, 80));
  }
  const project = snapshot.projects[0];
  assert.ok(project);
  const long = { ...project, name: "name".repeat(100), description: "word".repeat(100), install: "command".repeat(100), stars: "9".repeat(100) };
  const cards = await Promise.all([new ProjectsSection(ctx).card(long, "L", 0), new ProjectsSection(ctx).phoneCard(long, "R", 0)]);
  assertCardTextFits(cards[0] ?? "", cardLayout(DESKTOP, 0, 2, 200));
  assertCardTextFits(cards[1] ?? "", cardLayout(PHONE, 1, 2, 200));
  assertProjectArrowClearsName(cards[0] ?? "");
  assertProjectArrowClearsName(cards[1] ?? "");
  for (const svg of await Promise.all([...cards,
    ...await new HeaderSection(ctx).header(), ...await new HeaderSection(ctx).phoneHeader(),
  ])) assert.doesNotMatch(svg, /NaN|Infinity|\{\{/);
  assert.match(engine.render("css/header", {}), /\.name text\{font-size:inherit\}/);
});
