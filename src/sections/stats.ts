import { z } from "zod";
import { DESKTOP, FR, PHONE, X, esc, f1, num, up40 } from "../console.ts";
import { RenderContext } from "../ctx.ts";
import { need } from "../defined.ts";
import { kvDataSchema, langShareSchema, tileDataSchema } from "../schemas.ts";
import { themeVars } from "../templates.ts";

function yearsSince(since: Date, updated: string): number {
  const u = new Date(`${updated}T00:00:00Z`);
  const before =
    u.getUTCMonth() < since.getUTCMonth() ||
    (u.getUTCMonth() === since.getUTCMonth() && u.getUTCDate() < since.getUTCDate());
  return u.getUTCFullYear() - since.getUTCFullYear() - (before ? 1 : 0);
}

function fit(text: string, max: number, avail: number, spacing = 0): number {
  const n = [...text].length;
  return Math.min(max, Math.floor((2 * (avail - n * spacing)) / (0.6 * 1.04 * n)) / 2);
}

export class StatsSection {
  private ctx: RenderContext;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
  }

  private data(updated: string): {
    t1: z.infer<typeof tileDataSchema>[];
    kv: z.infer<typeof kvDataSchema>[];
    items: z.infer<typeof langShareSchema>[];
    desc: string;
  } {
    const s = this.ctx.snapshot;
    const profile = this.ctx.profile;
    const g = s.github;
    const since = new Date(profile.memberSince);
    const years = yearsSince(since, updated);
    const yearLabel = g === null ? "" : String(g.year);
    const t1 = [
      { label: "UPSTREAM STARS", value: num(s.stars), sub: `across ${s.upstreamRepos} repos` },
      {
        label: `CONTRIBUTIONS ${yearLabel}`,
        value: num(g === null ? null : g.contributions_year),
        sub: `${num(g === null ? null : g.contributions_all)} all time`,
      },
      {
        label: "PULL REQUESTS",
        value: num(g === null ? null : g.prs),
        sub: `${num(g === null ? null : g.prs_merged)} merged`,
      },
      {
        label: "CURRENT STREAK",
        value: g === null ? "—" : `${g.streak_current}d`,
        sub: `longest: ${g === null ? "—" : String(g.streak_longest)} days`,
      },
    ];
    const member =
      `${since.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })} (${years}y)`;
    const kv = [
      { key: "public repos", value: num(g === null ? null : g.public_repos) },
      { key: "member since", value: member },
      { key: "open issues", value: num(s.issues === null ? null : s.issues.count) },
      { key: "open PRs", value: num(s.prs === null ? null : s.prs.count) },
    ];
    const langs = g === null ? [] : Object.entries(g.languages);
    const total = langs.reduce((a, entry) => a + need(entry[1], "language repos"), 0) || 1;
    const top = langs.slice(0, profile.tuning.topLanguages);
    const other = total - top.reduce((a, entry) => a + need(entry[1], "language repos"), 0);
    const items: z.infer<typeof langShareSchema>[] = top.map((entry) => ({
      name: need(entry[0], "language name"),
      share: need(entry[1], "language repos") / total,
    }));
    if (other > 0) items.push({ name: "Other", share: other / total });
    const yearNum = g === null ? "—" : num(g.contributions_year);
    const allNum = g === null ? "—" : num(g.contributions_all);
    const desc =
      `GitHub stats: ${num(s.stars)} stars across ${s.upstreamRepos} upstream repos; ${yearNum} contributions in ${yearLabel}, ${allNum} all time; ` +
      `${num(g === null ? null : g.prs)} pull requests (${num(g === null ? null : g.prs_merged)} merged); ` +
      `current streak ${g === null ? "—" : String(g.streak_current)} days, ` +
      `longest ${g === null ? "—" : String(g.streak_longest)}; ` +
      `${num(s.issues === null ? null : s.issues.count)} open issues and ` +
      `${num(s.prs === null ? null : s.prs.count)} open pull requests. ` +
      `Top languages: ${items.map((item) => `${item.name} ${(item.share * 100).toFixed(1)}%`).join(", ")}.`;
    return { t1, kv, items, desc };
  }

  private tile(x: number, y: number, w: number, h: number, label: string, value: string, sub: string, delay: number): string {
    return this.ctx.engine.render("stats/tile", {
      ...themeVars(this.ctx.theme),
      x: f1(x),
      y,
      w: f1(w),
      h,
      cornerY: y + 12,
      cornerX: f1(x + 12),
      padX: f1(x + 16),
      labelY: y + 22,
      valueY: y + 50,
      subY: y + h - 12,
      label: esc(label),
      value: esc(value),
      sub: esc(sub),
      delay: delay.toFixed(2),
    });
  }

  private langBar(items: z.infer<typeof langShareSchema>[], bx: number, by: number, bw: number): string {
    const segs: string[] = [];
    let cx = bx;
    for (let i = 0; i < items.length; i++) {
      const item = need(items[i], `language ${i}`);
      const w = bw * item.share;
      const c = need(this.ctx.theme.langs[i], `language color ${i}`);
      segs.push(this.ctx.engine.render("stats/lang-seg", { x: f1(cx), y: by, w: f1(Math.max(w - 2, 1)), color: c }));
      cx += w;
    }
    return segs.join("");
  }

  private phoneCmd(lines: string[], delay: number, y: number): string {
    const out = lines.map((l, i) => {
      const tail = i < lines.length - 1 ? " \\" : "";
      if (i === 0) {
        return this.ctx.engine.render("stats/phone-cmd-first", { x: PHONE.X, y, cmd: esc(l), tail: esc(tail) });
      }
      return this.ctx.engine.render("stats/phone-cmd-cont", { x: f1(PHONE.X + 4 * 7.8), y: y + i * 18, cmd: esc(l), tail: esc(tail) });
    });
    return this.ctx.engine.render("console/fade-group", { delay: delay.toFixed(2), inner: out.join("\n") });
  }

  private phoneBox(x: number, y: number, w: number, h: number): string {
    return this.ctx.engine.render("stats/panel", { ...themeVars(this.ctx.theme), x: f1(x), y, w: f1(w), h, cornerY: y + 12, cornerX: f1(x + 12), inner: "" });
  }

  private phoneTile(x: number, y: number, w: number, h: number, label: string, value: string, sub: string, delay: number): string {
    const pad = 14;
    const avail = w - 2 * pad;
    return this.ctx.engine.render("stats/phone-tile", {
      ...themeVars(this.ctx.theme),
      x: f1(x),
      y,
      w: f1(w),
      h,
      cornerY: y + 12,
      cornerX: f1(x + 12),
      padX: f1(x + pad),
      labelY: y + 24,
      valueY: y + 58,
      subY: y + h - 14,
      label: esc(label),
      labelSize: fit(label, 12, avail, 1),
      value: esc(value),
      valueSize: fit(value, 32, avail),
      sub: esc(sub),
      subSize: fit(sub, 13, avail),
      delay: delay.toFixed(2),
    });
  }

  async stats(updated: string, counter: string): Promise<string> {
    const { engine, theme, profile } = this.ctx;
    const slices = this.ctx.slices;
    const data = this.data(updated);
    const parts: string[] = [
      slices.headingG(DESKTOP, 44, "stats", counter),
      slices.promptG(DESKTOP, `gh api graphql -F login=${profile.login} -f query=@profile.graphql`),
    ];
    const tw = 182;
    const gap = 16;
    const ty = 118;
    const th = 92;
    data.t1.forEach((tileData, i) =>
      parts.push(this.tile(X + i * (tw + gap), ty, tw, th, tileData.label, tileData.value, tileData.sub, 0.25 + i * 0.08)),
    );

    const ry = ty + th + 16;
    const rh = 38 + data.kv.length * 28;
    const lw = 320;
    const rows = data.kv
      .map((row, i) =>
        engine.render("stats/kv-row", {
          x: X + 16,
          y: ry + 38 + i * 28,
          key: esc(row.key),
          dots: ".".repeat(Math.max(profile.tuning.kvKeyWidth - row.key.length, 1)),
          value: esc(row.value),
        }),
      )
      .join("\n");
    parts.push(
      engine.render("console/fade-group", {
        delay: "0.60",
        inner:
          engine.render("stats/panel", { ...themeVars(theme), x: X, y: ry, w: lw, h: rh, cornerY: ry + 12, cornerX: X + 12, inner: "" }) +
          rows,
      }),
    );

    const lx = X + lw + gap;
    const lwid = FR - 36 - lx;
    const bx = lx + 16;
    const by = ry + 42;
    const bw = lwid - 32;
    const legend = data.items
      .map((item, i) => {
        const lxx = bx + (i % 2) * (bw / 2);
        const lyy = by + 36 + Math.floor(i / 2) * 26;
        return engine.render("stats/lang-item", {
          x: f1(lxx),
          swY: lyy - 9,
          color: need(theme.langs[i], `legend color ${i}`),
          nameX: f1(lxx + 18),
          y: lyy,
          name: esc(item.name),
          pctX: f1(lxx + bw / 2 - 24),
          pct: `${(item.share * 100).toFixed(1)}%`,
        });
      })
      .join("");
    parts.push(
      engine.render("console/fade-group", {
        delay: "0.70",
        inner:
          engine.render("stats/panel", { ...themeVars(theme), x: lx, y: ry, w: lwid, h: rh, cornerY: ry + 12, cornerX: lx + 12, inner: "" }) +
          engine.render("stats/lang-head", { x: lx + 16, y: ry + 24, size: 10.5 }) +
          engine.render("stats/lang-track", { ...themeVars(theme), x: bx, y: by, w: bw }) +
          this.langBar(data.items, bx, by, bw) +
          legend,
      }),
    );

    const fy = ry + rh + 30;
    parts.push(engine.render("console/fade-group", { delay: "1.00", inner: engine.render("stats/sync-line", { x: FR - 36, y: fy, updated: esc(updated) }) }));
    return slices.sliceG(DESKTOP, up40(fy + 16), parts.join("\n"), { title: "Stats", desc: data.desc, text: "—%.()d" });
  }

  async phoneStats(updated: string, counter: string): Promise<string> {
    const { engine, theme, profile } = this.ctx;
    const slices = this.ctx.slices;
    const g = PHONE;
    const data = this.data(updated);
    const cw = g.R - g.X;
    const gap = 12;
    const tw = (cw - gap) / 2;
    const th = 96;
    const parts: string[] = [slices.headingG(g, 44, "stats", counter)];
    parts.push(this.phoneCmd([`gh api graphql -F login=${profile.login}`, "-f query=@profile.graphql"], 0.15, 88));

    const ty = 124;
    data.t1.forEach((tileData, i) =>
      parts.push(
        this.phoneTile(g.X + (i % 2) * (tw + gap), ty + Math.floor(i / 2) * (th + gap), tw, th, tileData.label, tileData.value, tileData.sub, 0.25 + i * 0.08),
      ),
    );

    const ky = ty + 2 * (th + gap);
    const kh = 32 + (data.kv.length - 1) * 26 + 22;
    const cols = Math.floor((cw - 28) / 9);
    const rows = data.kv
      .map((row, i) => {
        const y = ky + 32 + i * 26;
        const dots = ".".repeat(Math.max(cols - row.key.length - [...row.value].length - 1, 1));
        return engine.render("stats/phone-kvrow", { x1: g.X + 14, y, key: esc(row.key), dots, x2: g.R - 14, value: esc(row.value) });
      })
      .join("\n");
    parts.push(engine.render("console/fade-group", { delay: "0.60", inner: this.phoneBox(g.X, ky, cw, kh) + rows }));

    const ly = ky + kh + gap;
    const bx = g.X + 14;
    const by = ly + 38;
    const bw = cw - 28;
    const colw = bw / 2;
    const legendRows = Math.ceil(data.items.length / 2);
    const lh = 38 + 8 + 26 + (legendRows - 1) * 24 + 20;
    const legend = data.items
      .map((item, i) => {
        const lxx = bx + (i % 2) * colw;
        const lyy = by + 34 + Math.floor(i / 2) * 24;
        const pct = `${(item.share * 100).toFixed(1)}%`;
        const px = lxx + colw - (i % 2 ? 0 : 20);
        const room = Math.floor((px - pct.length * 8.4 - 8 - (lxx + 18)) / 8.4);
        const name = [...item.name].length > room ? `${[...item.name].slice(0, room - 1).join("")}…` : item.name;
        return engine.render("stats/phone-legend-item", {
          x: f1(lxx),
          swY: lyy - 10,
          color: need(theme.langs[i], `phone legend color ${i}`),
          nameX: f1(lxx + 18),
          y: lyy,
          name: esc(name),
          px: f1(px),
          pct,
        });
      })
      .join("");
    parts.push(
      engine.render("console/fade-group", {
        delay: "0.70",
        inner:
          this.phoneBox(g.X, ly, cw, lh) +
          engine.render("stats/lang-head", { x: g.X + 14, y: ly + 24, size: 12 }) +
          engine.render("stats/lang-track", { ...themeVars(theme), x: bx, y: by, w: bw }) +
          this.langBar(data.items, bx, by, bw) +
          legend,
      }),
    );

    const fy = ly + lh + 28;
    parts.push(engine.render("console/fade-group", { delay: "1.00", inner: engine.render("stats/sync-line", { x: g.R, y: fy, updated: esc(updated) }) }));
    return slices.sliceG(g, up40(fy + 16), parts.join("\n"), { title: "Stats", desc: data.desc, text: "—%.()d…" });
  }
}
