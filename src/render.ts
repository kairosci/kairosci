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
import { ProjectsSection, logoHref } from "./sections/projects.ts";
import { StatsSection } from "./sections/stats.ts";
import { TrendingSection } from "./sections/trending.ts";
import { CREDIT_URL } from "./shared.ts";
import { TemplateEngine } from "./templates.ts";

const DEFAULT_THEME = "reef";
const ALSO_COLS = 4;

export class ProfileRenderer {
  private n = 0;
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

  async run(): Promise<void> {
    const page = new Page(this.ctx.engine);
    page.raw = `https://github.com/${this.ctx.profile.profileRepo}/raw/main/assets`;
    await this.headerLinks(page);
    await this.trendingSection(page);
    await this.statsCity(page);
    await this.projectsSection(page);
    await this.footer(page);
    await this.write(page);
  }

  private counter(): string {
    return `// ${String(++this.n).padStart(2, "0")}`;
  }

  private head(name: string, cmd: string, comment = ""): Promise<[string, string]> {
    const c = this.counter();
    return Promise.all([this.ctx.slices.sectionHead(name, c, cmd, comment), this.ctx.slices.phoneSectionHead(name, c, cmd, comment)]);
  }

  private async headerLinks(page: Page): Promise<void> {
    const profile = this.ctx.profile;
    const header = await this.header.header();
    const phoneHeader = await this.header.phoneHeader();
    page.add("header.svg", [header, phoneHeader], "100%", this.header.alt(), null);
    const links = this.buttons.linkButtons();
    page.add("links.svg", await this.head("links", `ping ${profile.login} --all-channels`), "100%", "Links", null);
    for (const entry of links.entries()) {
      const b = need(entry[1], "link");
      page.add(
        `links/${entry[0] + 1}.svg`,
        await Promise.all([
          this.buttons.button(b, entry[0], links.length, 0.25, false),
          this.buttons.phoneButton(b, entry[0], links.length, 0.25, false),
        ]),
        `${100 / links.length}%`,
        b.label,
        b.url,
        entry[0] > 0,
      );
    }
  }

  private async trendingSection(page: Page): Promise<void> {
    const starData = this.starData;
    if (starData === null) return;
    const found = this.trending.trends(starData);
    if (found.rows.length < 3) return;
    const c = this.counter();
    page.add(
      "trending.svg",
      await Promise.all([
        this.trending.head(starData, found.days, c),
        this.trending.phoneHead(starData, found.days, c),
      ]),
      "100%",
      `Trending: stars gained by ${this.ctx.profile.login}'s repos in the ${found.days} days to ${starData.end}`,
      null,
    );
    const top = need(found.rows[0], "top trend").gain;
    for (const rowEntry of found.rows.entries()) {
      const r = need(rowEntry[1], "trend row");
      page.add(
        `trending/${rowEntry[0] + 1}.svg`,
        await Promise.all([this.trending.row(r, rowEntry[0], top), this.trending.phoneRow(r, rowEntry[0], top)]),
        "100%",
        `${r.p.name}: +${r.gain} stars in ${found.days} days${r.isNew ? " (new)" : ""}, ${r.total} total`,
        r.p.href,
      );
    }
    page.add(
      "trending/legend.svg",
      await Promise.all([this.trending.legend(), this.trending.phoneLegend()]),
      "100%",
      "Legend",
      null,
    );
  }

  private async statsCity(page: Page): Promise<void> {
    const updated = this.calendar === null ? "" : need(last(this.calendar, "calendar")[0], "updated");
    const c = this.counter();
    page.add(
      "stats.svg",
      await Promise.all([this.stats.stats(updated, c), this.stats.phoneStats(updated, c)]),
      "100%",
      "Stats",
      null,
    );
    if (this.calendar !== null) {
      const cc = this.counter();
      page.add(
        "contribution-city.svg",
        await Promise.all([this.city.city(this.calendar, updated, cc), this.city.phoneCity(this.calendar, updated, cc)]),
        "100%",
        this.city.alt(this.calendar),
        null,
      );
    }
  }

  private async projectsSection(page: Page): Promise<void> {
    const s = this.ctx.snapshot;
    if (s.projects.length === 0) return;
    const nCards = Math.min(this.ctx.profile.maxCards, s.projects.length - (s.projects.length % 2));
    const carded = s.projects.slice(0, nCards);
    const rest = s.projects.slice(nCards);
    page.add("projects.svg", await this.head("projects", "ls -l ~/projects"), "100%", "Projects", null);
    for (const cardEntry of carded.entries()) {
      const p = need(cardEntry[1], "project card");
      const side = cardEntry[0] % 2 === 0 ? "L" : "R";
      page.add(
        `projects/${slugOf(p.name)}.svg`,
        await Promise.all([
          this.projects.card(p, side, 0.3 + cardEntry[0] * 0.12),
          this.projects.phoneCard(p, side, 0.3 + cardEntry[0] * 0.12),
        ]),
        "50%",
        `${p.name}: ${p.description} Install: ${p.install}`,
        p.href,
        cardEntry[0] % 2 === 1,
      );
    }
    for (let i = 0; i < rest.length; i += ALSO_COLS) {
      const group = rest.slice(i, i + ALSO_COLS);
      for (let k = 0; k < group.length; k++) {
        const p = need(group[k], "project button");
        const logo = await logoHref(p);
        const b = buttonSchema.parse({
          label: p.name,
          handle: p.tagline === "" ? p.kind : p.tagline,
          url: p.href,
          icon: logo === null ? "" : this.ctx.engine.render("cards/logo-img", { href: logo }),
        });
        page.add(
          `projects/also-${slugOf(p.name)}.svg`,
          await Promise.all([
            this.buttons.button(b, k, group.length, 0.3, false),
            this.buttons.phoneButton(b, k, group.length, 0.3, false),
          ]),
          `${100 / group.length}%`,
          `${p.name}: ${p.description}`,
          p.href,
          k > 0,
        );
      }
    }
  }

  private async footer(page: Page): Promise<void> {
    page.add(
      "footer.svg",
      await Promise.all([this.header.footer(), this.header.phoneFooter()]),
      "100%",
      "Connection closed.",
      CREDIT_URL,
    );
  }

  private async write(page: Page): Promise<void> {
    const root = this.root;
    await rm(`${root}/assets`, { recursive: true, force: true });
    for (const file of page.files) {
      const path = `${root}/assets/${need(file[0], "asset name")}`;
      await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
      await writeFile(path, need(file[1], `asset ${file[0]}`));
    }
    await writeFile(`${root}/README.md`, page.readme(this.ctx.profile));
    console.log(`rendered ${page.files.size} SVGs (${this.ctx.theme.name}) and README.md into ${root}`);
  }
}

function slugOf(name: string): string {
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
  await new ProfileRenderer(ctx, calendar, starData, root).run();
}

await main();
