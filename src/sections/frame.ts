import { siGithub } from "simple-icons";
import { z } from "zod";
import { DESKTOP, FR, PHONE, X, escapeMarkup } from "../console.ts";
import { RenderContext } from "../ctx.ts";
import { need } from "../defined.ts";
import { buttonSchema, geoSchema } from "../schemas.ts";
import { createThemeSvgVariables } from "../templates.ts";
import { projectCardGeometry, fitText, fontMetrics, profileNameLayout, textWidth, wrapText } from "../layout.ts";


export class HeaderSection {
  private ctx: RenderContext;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
  }


  alt(): string {
    const s = this.ctx.snapshot;
    const profile = this.ctx.profile;
    return `${profile.displayName} (@${profile.login}). ${s.intro} Top repos: ${s.projects
      .slice(0, profile.tuning.headerTools)
      .map((p) => p.name)
      .join(", ")}.`;
  }

  async header(): Promise<string> {
    const { engine, theme, profile } = this.ctx;
    const slices = this.ctx.slices;
    const bio = this.ctx.snapshot.intro === "" ? profile.displayName : this.ctx.snapshot.intro;
    const name = profile.headerName.toUpperCase();
    const nameTop = 68 + 15 * fontMetrics.ascent;
    const nameWidthSize = (DESKTOP.contentRight - X - 2 * DESKTOP.margin * fontMetrics.advance) /
      (Array.from(name).length * (fontMetrics.advance + fontMetrics.advance / 25));
    const nameBox = profileNameLayout(name, DESKTOP.contentRight - X, nameTop, nameTop + nameWidthSize * (fontMetrics.capitals + fontMetrics.descent), DESKTOP.margin * fontMetrics.advance);
    const bioLines = wrapText(bio, DESKTOP.contentRight - X - textWidth(">> ", 15), 15);
    const firstRow = engine.render("frame/header-line", { x: X, text: escapeMarkup(need(bioLines[0], "GitHub description")) });
    const continuationRows = bioLines.slice(1).map((line) => engine.render("frame/header-continuation", { x: X + textWidth(">> ", 15), text: escapeMarkup(line) }));
    const bioRows = [firstRow, ...continuationRows];
    const bioTop = Math.ceil(nameBox.baseline + nameBox.size * fontMetrics.descent + 15 * fontMetrics.ascent);
    const bioLineHeight = 15 * fontMetrics.ascent;
    const h = Math.ceil((bioTop + (bioRows.length - 1) * bioLineHeight + 15 * fontMetrics.descent + DESKTOP.margin * fontMetrics.advance) / 40) * 40;
    const defs = engine.render("frame/defs-header", { x: X, clipY: 46 });
    const descLines = need(slices.renderStaggeredRows(bioRows, bioTop, bioLineHeight, 1.75, 0.12)[0], "GitHub description lines");
    const body = engine.render("frame/header-top", {
      ...createThemeSvgVariables(theme),
      x: X,
      whoY: 68,
      nameSize: nameBox.size,
      nameSpacing: nameBox.spacing,
      nameY: nameBox.baseline,
      gmX: X + DESKTOP.margin * fontMetrics.advance / 2,
      gcX: X - DESKTOP.margin * fontMetrics.advance / 2,
      name: escapeMarkup(name),
      descLines,
    });
    return slices.createSvgSlice(DESKTOP, h, body, {
        title: profile.displayName,
        desc: this.alt(),
        text: name + "$ whoami>>" + bio,
        top: true,
        css: this.ctx.engine.render("css/header", {}),
        defs,
        weights: [400, 700, 800],
      });
  }

  async phoneHeader(): Promise<string> {
    const { engine, theme, snapshot, profile } = this.ctx;
    const slices = this.ctx.slices;
    const g = PHONE;
    const bio = snapshot.intro === "" ? profile.displayName : snapshot.intro;
    const name = profile.headerName.toUpperCase();
    const defs = engine.render("frame/defs-header", { x: g.contentLeft, clipY: 30 });
    const nameTop = 52 + 15 * fontMetrics.ascent;
    const nameWidthSize = (g.contentRight - g.contentLeft - 2 * g.margin * fontMetrics.advance) /
      (Array.from(name).length * (fontMetrics.advance + fontMetrics.advance / 25));
    const nameBox = profileNameLayout(name, g.contentRight - g.contentLeft, nameTop, nameTop + nameWidthSize * (fontMetrics.capitals + fontMetrics.descent), g.margin * fontMetrics.advance);
    const bioLines = wrapText(bio, g.contentRight - g.contentLeft - textWidth(">> ", 15), 15);
    const firstRow = engine.render("frame/header-line", { x: g.contentLeft, text: escapeMarkup(need(bioLines[0], "GitHub description")) });
    const continuationRows = bioLines.slice(1).map((line) => engine.render("frame/header-continuation", { x: g.contentLeft + textWidth(">> ", 15), text: escapeMarkup(line) }));
    const bioRows = [firstRow, ...continuationRows];
    const bioTop = Math.ceil(nameBox.baseline + nameBox.size * fontMetrics.descent + 15 * fontMetrics.ascent);
    const bioLineHeight = 15 * fontMetrics.ascent;
    const h = Math.ceil((bioTop + (bioRows.length - 1) * bioLineHeight + 15 * fontMetrics.descent + g.margin * fontMetrics.advance) / 40) * 40;
    const step = 0.12;
    const descLines = slices.renderStaggeredRows(bioRows, bioTop, bioLineHeight, 1.75, step)[0];
    const body = engine.render("frame/header-top", {
      ...createThemeSvgVariables(theme),
      x: g.contentLeft,
      whoY: 52,
      nameSize: nameBox.size,
      nameSpacing: nameBox.spacing,
      nameY: nameBox.baseline,
      gmX: g.contentLeft + g.margin * fontMetrics.advance / 2,
      gcX: g.contentLeft - g.margin * fontMetrics.advance / 2,
      name: escapeMarkup(name),
      descLines: need(descLines, "phone GitHub description lines"),
    });
    return slices.createSvgSlice(g, h, body, {
        title: profile.displayName,
        desc: this.alt(),
        text: name + "$ whoami>>" + bio,
        top: true,
        css: this.ctx.engine.render("css/header", {}),
        defs,
        weights: [400, 700, 800],
      });
  }

  async footer(): Promise<string> {
    const { engine, profile } = this.ctx;
    const body = engine.render("frame/footer", {
      x: X,
      login: profile.login,
      endX: FR - 36,
    });
    return this.ctx.slices.createSvgSlice(DESKTOP, 80, body, {
      title: "End of profile",
      desc: "Connection closed.",
      text: `$ exit connection to ${profile.login} closed. // EOF`,
      bottom: true,
    });
  }

  async phoneFooter(): Promise<string> {
    const { engine, profile } = this.ctx;
    const g = PHONE;
    const body = engine.render("frame/phone-footer", {
      x: g.contentLeft,
      r: g.contentRight,
      login: profile.login,
    });
    return this.ctx.slices.createSvgSlice(g, 120, body, {
      title: "End of profile",
      desc: "Connection closed.",
      text: `$ exit connection to ${profile.login} closed. // EOF`,
      bottom: true,
    });
  }
}

export class Buttons {
  private ctx: RenderContext;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
  }

  private iconFor(kind: string): string {
    const theme = this.ctx.theme;
    if (kind === "github") return this.ctx.engine.render("frame/icon-github", { ...createThemeSvgVariables(theme), d: siGithub.path });
    if (kind === "website") return this.ctx.engine.render("frame/icon-website", { ...createThemeSvgVariables(theme) });
    throw new Error(`missing icon ${kind}`);
  }

  linkButtons(): z.infer<typeof buttonSchema>[] {
    const profile = this.ctx.profile;
    return profile.links.map((link) => ({
      label: link.label,
      handle: link.handle,
      url: link.url,
      icon: this.iconFor(link.icon),
    }));
  }

  button(b: z.infer<typeof buttonSchema>, k: number, n: number, delay0 = 0.25, framed = false): Promise<string> {
    return this.renderButton(b, DESKTOP, k, n, delay0, framed);
  }

  phoneButton(b: z.infer<typeof buttonSchema>, k: number, n: number, delay0 = 0.25, framed = false): Promise<string> {
    return this.renderButton(b, PHONE, k, n, delay0, framed);
  }

  private async renderButton(b: z.infer<typeof buttonSchema>, g: z.infer<typeof geoSchema>, k: number, n: number, delay0: number, framed: boolean): Promise<string> {
    const { engine, theme, slices } = this.ctx;
    const height = 80;
    const card = projectCardGeometry(g, k, n, height);
    const iconSize = 18;
    const centered = g.narrow;
    const labelSize = centered ? 12 : 13;
    const labelX = centered ? card.x + card.width / 2 : card.left + iconSize + card.padding / 2;
    const labelWidth = centered ? card.right - card.left : card.right - labelX;
    const label = fitText(b.label, labelWidth, labelSize);
    const handle = fitText(b.handle, centered ? card.right - card.left : labelWidth, 10);
    const content = engine.render("cards/link", {
      ...createThemeSvgVariables(theme), icon: b.icon,
      iconX: centered ? card.x + (card.width - iconSize) / 2 : card.left,
      iconY: card.top,
      labelX, labelY: centered ? card.bottom - labelSize * fontMetrics.descent : card.top + labelSize * fontMetrics.capitals,
      labelSize, label: escapeMarkup(label), anchor: centered ? "middle" : "start",
      handle: centered ? "" : engine.render("cards/link-handle", { x: labelX, y: card.bottom - 10 * fontMetrics.descent, text: escapeMarkup(handle) }),
    });
    const body = engine.render("cards/shell", { ...createThemeSvgVariables(theme), ...card, content, delay: delay0 + k * 0.08 });
    return slices.createSegmentSvgSlice(g, k, n, height, body, { title: b.label, desc: `${b.label}: ${b.url}`, text: label + handle + ">_" }, framed);
  }
}
