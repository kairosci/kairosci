import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { RenderContext } from "./ctx.ts";
import { last, need } from "./defined.ts";
import { Page } from "./page.ts";
import { loadProfile, loadTheme } from "./profile.ts";
import {
  buttonSchema,
  calendarSchema,
  snapshotSchema,
  starsSchema,
} from "./schemas.ts";
import { CitySection } from "./sections/city.ts";
import { Buttons, HeaderSection } from "./sections/frame.ts";
import { ProjectsSection, resolveProjectLogoUrl } from "./sections/projects.ts";
import { StatsSection } from "./sections/stats.ts";
import { TrendingSection } from "./sections/trending.ts";
import { TemplateEngine } from "./templates.ts";

const DEFAULT_THEME = "reef";
const ALSO_COLS = 4;

export class ProfileRenderer {
  private sectionNumber = 0;
  private header: HeaderSection;
  private buttons: Buttons;
  private stats: StatsSection;
  private trending: TrendingSection;
  private city: CitySection;
  private projects: ProjectsSection;
  private ctx: RenderContext;
  private calendar: z.infer<typeof calendarSchema> | null;
  private starData: z.infer<typeof starsSchema> | null;
  private root: string;

  constructor(
    ctx: RenderContext,
    calendar: z.infer<typeof calendarSchema> | null,
    starData: z.infer<typeof starsSchema> | null,
    root: string,
  ) {
    this.ctx = ctx;
    this.calendar = calendar;
    this.starData = starData;
    this.root = root;
    this.header = new HeaderSection(ctx);
    this.buttons = new Buttons(ctx);
    this.stats = new StatsSection(ctx);
    this.trending = new TrendingSection(ctx);
    this.city = new CitySection(ctx);
    this.projects = new ProjectsSection(ctx);
  }

  async renderProfile(): Promise<void> {
    const page = new Page(this.ctx.engine);
    page.raw = `https://github.com/${this.ctx.profile.profileRepo}/raw/main/assets`;
    await this.renderHeaderAndLinks(page);
    await this.renderTrendingSection(page);
    await this.renderStatsAndCity(page);
    await this.renderProjectsSection(page);
    await this.renderFooter(page);
    await this.writeGeneratedProfile(page);
  }

  private nextSectionCounter(): string {
    return `// ${String(++this.sectionNumber).padStart(2, "0")}`;
  }

  private renderSectionHeaderVariants(name: string, cmd: string, comment = ""): Promise<[string, string]> {
    const counter = this.nextSectionCounter();
    return Promise.all([
      this.ctx.slices.renderDesktopSectionHeader(name, counter, cmd, comment),
      this.ctx.slices.renderPhoneSectionHeader(name, counter, cmd, comment),
    ]);
  }

  private async renderHeaderAndLinks(page: Page): Promise<void> {
    const profile = this.ctx.profile;
    const header = await this.header.header();
    const phoneHeader = await this.header.phoneHeader();
    page.addImageAsset("header.svg", [header, phoneHeader], "100%", this.header.alt(), null);
    const links = this.buttons.linkButtons();
    page.addImageAsset("links.svg", await this.renderSectionHeaderVariants("links", `ping ${profile.login} --all-channels`), "100%", "Links", null);
    for (const entry of links.entries()) {
      const linkButton = need(entry[1], "link");
      page.addImageAsset(
        `links/${entry[0] + 1}.svg`,
        await Promise.all([
          this.buttons.button(linkButton, entry[0], links.length, 0.25, false),
          this.buttons.phoneButton(linkButton, entry[0], links.length, 0.25, false),
        ]),
        `${100 / links.length}%`,
        linkButton.label,
        linkButton.url,
        entry[0] > 0,
      );
    }
  }

  private async renderTrendingSection(page: Page): Promise<void> {
    const starData = this.starData;
    if (starData === null) return;
    const trendCollection = this.trending.collectTrendingRepositories(starData);
    if (trendCollection.rows.length < 3) return;
    const counter = this.nextSectionCounter();
    page.addImageAsset(
      "trending.svg",
      await Promise.all([
        this.trending.renderDesktopHeader(starData, trendCollection.days, counter),
        this.trending.renderPhoneHeader(starData, trendCollection.days, counter),
      ]),
      "100%",
      `Trending: stars gained by ${this.ctx.profile.login}'s repos in the ${trendCollection.days} days to ${starData.end}`,
      null,
    );
    const maximumGain = need(trendCollection.rows[0], "top trend").gain;
    for (const trendEntry of trendCollection.rows.entries()) {
      const trend = need(trendEntry[1], "trend row");
      page.addImageAsset(
        `trending/${trendEntry[0] + 1}.svg`,
        await Promise.all([
          this.trending.renderDesktopRow(trend, trendEntry[0], maximumGain),
          this.trending.renderPhoneRow(trend, trendEntry[0], maximumGain),
        ]),
        "100%",
        `${trend.p.name}: +${trend.gain} stars in ${trendCollection.days} days${trend.isNew ? " (new)" : ""}, ${trend.total} total`,
        trend.p.href,
      );
    }
    page.addImageAsset(
      "trending/legend.svg",
      await Promise.all([this.trending.renderDesktopLegend(), this.trending.renderPhoneLegend()]),
      "100%",
      "Legend",
      null,
    );
  }

  private async renderStatsAndCity(page: Page): Promise<void> {
    const updated = this.calendar === null ? "" : need(last(this.calendar, "calendar")[0], "updated");
    const counter = this.nextSectionCounter();
    page.addImageAsset(
      "stats.svg",
      await Promise.all([this.stats.renderDesktopStats(updated, counter), this.stats.renderPhoneStats(updated, counter)]),
      "100%",
      "Stats",
      null,
    );
    if (this.calendar !== null) {
      const cityCounter = this.nextSectionCounter();
      page.addImageAsset(
        "contribution-city.svg",
        await Promise.all([
          this.city.renderDesktopCity(this.calendar, updated, cityCounter),
          this.city.renderPhoneCity(this.calendar, updated, cityCounter),
        ]),
        "100%",
        this.city.describeContributionCity(this.calendar),
        null,
      );
    }
  }

  private async renderProjectsSection(page: Page): Promise<void> {
    const snapshot = this.ctx.snapshot;
    if (snapshot.projects.length === 0) return;
    const featuredCardCount = Math.min(this.ctx.profile.maxCards, snapshot.projects.length - (snapshot.projects.length % 2));
    const featuredProjects = snapshot.projects.slice(0, featuredCardCount);
    const additionalProjects = snapshot.projects.slice(featuredCardCount);
    page.addImageAsset("projects.svg", await this.renderSectionHeaderVariants("projects", "ls -l ~/projects"), "100%", "Projects", null);
    for (const cardEntry of featuredProjects.entries()) {
      const project = need(cardEntry[1], "project card");
      const side = cardEntry[0] % 2 === 0 ? "L" : "R";
      page.addImageAsset(
        `projects/${createAssetSlug(project.name)}.svg`,
        await Promise.all([
          this.projects.renderDesktopProjectCard(project, side, 0.3 + cardEntry[0] * 0.12),
          this.projects.renderPhoneProjectCard(project, side, 0.3 + cardEntry[0] * 0.12),
        ]),
        "50%",
        `${project.name}: ${project.description} Install: ${project.install}`,
        project.href,
        cardEntry[0] % 2 === 1,
      );
    }
    for (let offset = 0; offset < additionalProjects.length; offset += ALSO_COLS) {
      const projectGroup = additionalProjects.slice(offset, offset + ALSO_COLS);
      for (let buttonIndex = 0; buttonIndex < projectGroup.length; buttonIndex++) {
        const project = need(projectGroup[buttonIndex], "project button");
        const logo = await resolveProjectLogoUrl(project);
        const projectButton = buttonSchema.parse({
          label: project.name,
          handle: project.tagline === "" ? project.kind : project.tagline,
          url: project.href,
          icon: logo === null ? "" : this.ctx.engine.render("cards/logo-img", { href: logo }),
        });
        page.addImageAsset(
          `projects/also-${createAssetSlug(project.name)}.svg`,
          await Promise.all([
            this.buttons.button(projectButton, buttonIndex, projectGroup.length, 0.3, false),
            this.buttons.phoneButton(projectButton, buttonIndex, projectGroup.length, 0.3, false),
          ]),
          `${100 / projectGroup.length}%`,
          `${project.name}: ${project.description}`,
          project.href,
          buttonIndex > 0,
        );
      }
    }
  }

  private async renderFooter(page: Page): Promise<void> {
    page.addImageAsset(
      "footer.svg",
      await Promise.all([this.header.footer(), this.header.phoneFooter()]),
      "100%",
      "Connection closed.",
      null,
    );
  }

  private async writeGeneratedProfile(page: Page): Promise<void> {
    const root = this.root;
    await rm(`${root}/assets`, { recursive: true, force: true });
    for (const file of page.files) {
      const path = `${root}/assets/${need(file[0], "asset name")}`;
      await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
      await writeFile(path, need(file[1], `asset ${file[0]}`));
    }
    await writeFile(`${root}/README.md`, page.renderReadme(this.ctx.profile));
    console.log(`rendered ${page.files.size} SVGs (${this.ctx.theme.name}) and README.md into ${root}`);
  }
}

function createAssetSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

async function main(): Promise<void> {
  const engine = new TemplateEngine();
  await engine.load("templates");
  const profile = await loadProfile();
  const { values } = parseArgs({
    options: { theme: { type: "string", default: DEFAULT_THEME }, root: { type: "string", default: "." } },
  });
  const themeOpt = values.theme;
  const theme = await loadTheme(themeOpt === undefined ? DEFAULT_THEME : themeOpt);
  const rootOpt = values.root;
  const root = rootOpt === undefined ? "." : rootOpt;
  const s = snapshotSchema.parse(JSON.parse(await readFile("data/snapshot.json", "utf8")));
  let calendar: z.infer<typeof calendarSchema> | null = null;
  try {
    calendar = calendarSchema.parse(JSON.parse(await readFile("data/calendar.json", "utf8")));
  } catch {
    calendar = null;
  }
  let starData: z.infer<typeof starsSchema> | null = null;
  try {
    starData = starsSchema.parse(JSON.parse(await readFile("data/stars.json", "utf8")));
  } catch {
    starData = null;
  }
  const ctx = new RenderContext(engine, theme, s, profile);
  await new ProfileRenderer(ctx, calendar, starData, root).renderProfile();
}

await main();
