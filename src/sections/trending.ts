import { z } from "zod";
import { DESKTOP, FR, PHONE, X, escapeMarkup, formatSvgNumber, formatNumber, roundUpTo40 } from "../console.ts";
import { RenderContext } from "../ctx.ts";
import { last, need } from "../defined.ts";
import { projectSchema, starsSchema, trendSchema } from "../schemas.ts";
import {
  colorForRepository,
  countDaysBetweenIsoDates,
  formatCompactNumber,
  formatMonthDay,
  shiftIsoDateByDays,
  sumDailyContributionCounts,
} from "../shared.ts";
import { createThemeSvgVariables } from "../templates.ts";

const P = PHONE;
const PBX = 180;
const PHX = P.contentRight - 60;
const CH11 = 6.6;
const CH13 = 7.8;

function describeTrendRow(r: z.infer<typeof trendSchema>, pitch: string): string {
  const chipText = r.isNew ? " (new)" : r.ratio === null ? "" : ` (${r.ratio.toFixed(1)}x the previous window)`;
  return `${r.p.name}${chipText}: +${r.gain} stars, ${r.total} total. ${pitch}.`;
}

function fitDisplayText(s: string, chars: number): string {
  if (s.length <= chars) return s;
  const cut = s.slice(0, chars - 1).replace(/\s+\S*$/, "");
  return `${cut}…`;
}

export class TrendingSection {
  private ctx: RenderContext;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
  }

  collectTrendingRepositories(stars: z.infer<typeof starsSchema>): { rows: z.infer<typeof trendSchema>[]; days: number } {
    const theme = this.ctx.theme;
    const projects: z.infer<typeof projectSchema>[] = this.ctx.snapshot.projects;
    const tuning = this.ctx.profile.tuning;
    const byRepo = new Map(projects.map((p) => [p.repo.toLowerCase(), p]));
    const end = stars.end;
    const windows = tuning.trendWindows;
    for (let wi = 0; wi < windows.length; wi++) {
      const days = need(windows[wi], "trend window");
      const rows: z.infer<typeof trendSchema>[] = [];
      for (const entry of Object.entries(stars.repos)) {
        const repo = need(entry[0], "trend repo");
        const s = need(entry[1], `stars for ${repo}`);
        const p = byRepo.get(repo.toLowerCase());
        if (p === undefined) continue;
        const from = shiftIsoDateByDays(end, -(days - 1));
        const gain = sumDailyContributionCounts(s.daily, from, end);
        const prior = sumDailyContributionCounts(s.daily, shiftIsoDateByDays(from, -days), shiftIsoDateByDays(from, -1));
        const isNew = countDaysBetweenIsoDates(s.created_at, end) < tuning.newDays;
        const hot = countDaysBetweenIsoDates(s.created_at, end) >= 2 * days && prior >= 20 && gain / prior >= 1.2;
        const daily: number[] = [];
        for (let i = 0; i < 30; i++) {
          const v = s.daily[shiftIsoDateByDays(end, i - 29)];
          daily.push(v === undefined ? 0 : v);
        }
        if (gain > 0) {
          rows.push({
            p,
            color: colorForRepository(theme, repo),
            gain,
            gain7: sumDailyContributionCounts(s.daily, shiftIsoDateByDays(end, -6), end),
            prior,
            total: sumDailyContributionCounts(s.daily, "0000", end),
            isNew,
            ratio: hot ? gain / prior : null,
            daily,
          });
        }
      }
      rows.sort((a, b) => b.gain - a.gain || b.gain7 - a.gain7 || a.p.name.localeCompare(b.p.name));
      const lastWindow = wi === windows.length - 1;
      if (rows.filter((r) => r.gain >= tuning.minTrendGain).length >= tuning.minTrendGainers || lastWindow) {
        return { rows: rows.slice(0, tuning.maxTrendRows), days };
      }
    }
    throw new Error("unreachable");
  }

  private createBarGradientDefinitions(c: string): string {
    return this.ctx.engine.render("trending/def-bar", { color: c });
  }

  private renderTrendChip(r: z.infer<typeof trendSchema>, cx: number, y: number, ty: number, size: number): string {
    const theme = this.ctx.theme;
    if (!r.isNew && r.ratio === null) return "";
    const label = r.isNew ? "NEW" : `▲${need(r.ratio, "trend ratio").toFixed(1)}x`;
    const color = r.isNew ? theme.accent2 : theme.ok;
    return this.ctx.engine.render("trending/trend-chip", {
      x: formatSvgNumber(cx),
      y,
      w: formatSvgNumber(label.length * 6.6 + 10),
      tx: formatSvgNumber(cx + 5),
      ty,
      size,
      label: escapeMarkup(label),
      color,
    });
  }

  async renderDesktopHeader(stars: z.infer<typeof starsSchema>, days: number, counter: string): Promise<string> {
    const profile = this.ctx.profile;
    const slices = this.ctx.slices;
    const sub = `★ gained · ${days} days to ${formatMonthDay(stars.end)} (UTC)`;
    let total = 0;
    for (const entry of Object.values(stars.repos)) total += entry.total;
    const body =
      `${slices.renderSectionHeading(DESKTOP, 44, "trending", counter)}\n` +
      `${slices.renderCommandPrompt(DESKTOP, `gh api repos/${profile.login}/{repo}/stargazers --paginate`, 0.15, "# what is getting starred")}\n` +
      this.ctx.engine.render("trending/trend-sub", { x: X, sub: escapeMarkup(sub), total: escapeMarkup(`★ ${formatCompactNumber(total)} total`), fr: FR - 36 });
    return slices.createSvgSlice(DESKTOP, 160, body, {
      title: "Trending",
      desc: `Stars gained by ${profile.login}'s repos in the ${days} days to ${formatMonthDay(stars.end)}.`,
      text: `~/trending${counter}$ gh api repos/${profile.login}/{repo}/stargazers --paginate # what is getting starred${sub}`,
    });
  }

  async renderDesktopRow(r: z.infer<typeof trendSchema>, i: number, max: number): Promise<string> {
    const slices = this.ctx.slices;
    const c = r.color;
    const delay = 0.2 + i * 0.09;
    const nameW = r.p.name.length * 9;
    const w = Math.max(2, (r.gain / max) * 330);
    const hmax = Math.max(1, ...r.daily);
    const hist = r.daily
      .map((n, k) => {
        const h = n > 0 ? Math.max(1.5, (n / hmax) * 24) : 0;
        if (h === 0) return "";
        return this.ctx.engine.render("trending/trend-hist", { x: 660 + k * 3, y: formatSvgNumber(32 - h), w: 2, h: formatSvgNumber(h) });
      })
      .join("");
    const pitch = r.p.tagline === "" ? r.p.kind : r.p.tagline;
    const body = this.ctx.engine.render("trending/trend-row", {
      ...createThemeSvgVariables(this.ctx.theme),
      stripeX: X - 10,
      stripeW: FR - 36 - X + 20,
      stripe: i % 2 === 0 ? ".04" : "0",
      x: X,
      nameY: 19,
      nameSize: 15,
      name: escapeMarkup(r.p.name),
      color: c,
      chip: this.renderTrendChip(r, X + nameW + 10, 7, 18, 10),
      pitchY: 33,
      pitchSize: 10.5,
      pitch: escapeMarkup(pitch),
      bx: 270,
      trackY: 14,
      bw: 330,
      barH: 12,
      w: formatSvgNumber(w),
      delay: delay.toFixed(2),
      barDelay: (delay + 0.15).toFixed(2),
      lblX: formatSvgNumber(270 + w + 8),
      lblY: 25,
      lblDelay: (delay + 0.6).toFixed(2),
      gain: formatNumber(r.gain),
      hist,
      total: this.ctx.engine.render("trending/trend-total", { fr: FR - 36, y: 25, total: formatNumber(r.total) }),
    });
    return slices.createSvgSlice(DESKTOP, 40, body, {
      title: r.p.name,
      css: this.ctx.engine.render("css/row", {}),
      defs: this.createBarGradientDefinitions(c),
      desc: describeTrendRow(r, pitch),
      text: `${r.p.name}NEW▲.x${pitch}+★${r.gain}${r.total}`,
    });
  }

  async renderDesktopLegend(): Promise<string> {
    const text = "bar: stars gained · ticks: stars per day · NEW: under 60 days old · ▲: faster than the window before";
    return this.ctx.slices.createSvgSlice(DESKTOP, 40, this.ctx.engine.render("trending/trend-legend", { x: X, text: escapeMarkup(text) }), { title: "Legend", desc: text, text });
  }

  async renderPhoneHeader(stars: z.infer<typeof starsSchema>, days: number, counter: string): Promise<string> {
    const profile = this.ctx.profile;
    const slices = this.ctx.slices;
    const sub = `★ gained · ${days} days to ${formatMonthDay(stars.end)} (UTC)`;
    let total = 0;
    for (const entry of Object.values(stars.repos)) total += entry.total;
    const body =
      `${slices.renderSectionHeading(P, 44, "trending", counter)}\n` +
      `${slices.renderCommandPrompt(P, `gh api repos/${profile.login}/{repo}/stargazers`, 0.15, "# starred", 92, 13)}\n` +
      this.ctx.engine.render("trending/ptrend-sub", {
        x: P.contentLeft,
        sub: escapeMarkup(sub),
        total: escapeMarkup(`${formatCompactNumber(total)}★ total`),
      });
    return slices.createSvgSlice(P, 160, body, {
      title: "Trending",
      desc: `Stars gained by ${profile.login}'s repos in the ${days} days to ${formatMonthDay(stars.end)}.`,
      text: `~/trending${counter}$ gh api repos/${profile.login}/{repo}/stargazers # starred${sub}`,
    });
  }

  async renderPhoneRow(r: z.infer<typeof trendSchema>, i: number, max: number): Promise<string> {
    const slices = this.ctx.slices;
    const c = r.color;
    const delay = 0.2 + i * 0.09;
    const hasChip = r.isNew || r.ratio !== null;
    const label = r.isNew ? "NEW" : r.ratio === null ? "" : `▲${r.ratio.toFixed(1)}x`;
    const chipW = hasChip ? label.length * (CH11 + 0.5) + 9.5 : 0;
    const room = PBX - 10 - P.contentLeft - (hasChip ? chipW + 8 : 0);
    const size = Math.min(15, Math.floor((room / (r.p.name.length * 0.6)) * 2) / 2);
    const bw = Math.min(170, P.contentRight - PBX - 6 - `+${formatNumber(max)}`.length * CH13);
    const w = Math.max(2, (r.gain / max) * bw);
    const hmax = Math.max(1, ...r.daily);
    const hist = r.daily
      .map((n, k) => {
        const h = n > 0 ? Math.max(1.5, (n / hmax) * 11) : 0;
        if (h === 0) return "";
        return this.ctx.engine.render("trending/trend-hist", { x: PHX + k * 2, y: formatSvgNumber(33 - h), w: 1.5, h: formatSvgNumber(h) });
      })
      .join("");
    const pitch = r.p.tagline === "" ? r.p.kind : r.p.tagline;
    const tag = fitDisplayText(pitch, Math.floor((PHX - 10 - P.contentLeft) / CH11));
    const chipX = P.contentLeft + r.p.name.length * size * 0.6 + 8;
    const body = this.ctx.engine.render("trending/trend-row", {
      ...createThemeSvgVariables(this.ctx.theme),
      stripeX: P.contentLeft - 10,
      stripeW: P.contentRight - P.contentLeft + 20,
      stripe: i % 2 === 0 ? ".04" : "0",
      x: P.contentLeft,
      nameY: 18,
      nameSize: size,
      name: escapeMarkup(r.p.name),
      color: c,
      chip: hasChip ? this.renderTrendChip(r, chipX, 5, 16.5, 11) : "",
      pitchY: 32,
      pitchSize: 11,
      pitch: escapeMarkup(tag),
      bx: PBX,
      trackY: 7,
      bw: formatSvgNumber(bw),
      barH: 11,
      w: formatSvgNumber(w),
      delay: delay.toFixed(2),
      barDelay: (delay + 0.15).toFixed(2),
      lblX: formatSvgNumber(PBX + w + 6),
      lblY: 17.5,
      lblDelay: (delay + 0.6).toFixed(2),
      gain: formatNumber(r.gain),
      hist,
      total: "",
    });
    return slices.createSvgSlice(P, 40, body, {
      title: r.p.name,
      css: this.ctx.engine.render("css/row", {}),
      defs: this.createBarGradientDefinitions(c),
      desc: describeTrendRow(r, pitch),
      text: `${r.p.name}NEW▲.x${tag}+${r.gain}`,
    });
  }

  async renderPhoneLegend(): Promise<string> {
    const slices = this.ctx.slices;
    const text = "bar: stars gained · ticks: stars per day · NEW: under 60 days old · ▲: faster than the window before";
    const cols = Math.floor((P.contentRight - P.contentLeft) / CH11);
    const lines: string[] = [];
    for (const part of text.split(" · ")) {
      const prev = lines.length === 0 ? null : last(lines, "legend line");
      if (prev !== null && prev.length + 3 + part.length <= cols) {
        lines[lines.length - 1] = `${prev} · ${part}`;
      } else {
        lines.push(part);
      }
    }
    const h = roundUpTo40(lines.length * 15 + 10);
    const y0 = (h - lines.length * 15) / 2 + 11;
    const inner = lines
      .map((l, k) => this.ctx.engine.render("trending/ptrend-legend-line", { x: P.contentLeft, y: y0 + k * 15, text: escapeMarkup(l) }))
      .join("");
    return slices.createSvgSlice(P, h, this.ctx.engine.render("console/fade-group", { delay: "0.80", inner }), { title: "Legend", desc: text, text });
  }
}
