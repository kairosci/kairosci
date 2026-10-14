import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { last, need } from "./defined.ts";
import { Page } from "./page.ts";
import { loadProfile, loadTheme } from "./profile.ts";
import {
  buttonSchema,
  calendarSchema,
  snapshotSchema,
  starsSchema,
} from "./schemas.ts";
import { city, cityAlt, phoneCity } from "./sections/city.ts";
import {
  button,
  footer,
  header,
  headerAlt,
  linkButtons,
  phoneButton,
  phoneFooter,
  phoneHeader,
  phoneSectionHead,
  sectionHead,
} from "./sections/frame.ts";
import { card, logoHref, phoneCard } from "./sections/projects.ts";
import { phoneStats, stats } from "./sections/stats.ts";
import {
  phoneTrendingHead,
  phoneTrendingLegend,
  phoneTrendingRow,
  trendingHead,
  trendingLegend,
  trendingRow,
  trends,
} from "./sections/trending.ts";
import { CREDIT_URL } from "./shared.ts";
import { configureSky } from "./sky.ts";
import { loadTemplates, render } from "./templates.ts";

const DEFAULT_THEME = "reef";
const ALSO_COLS = 4;

async function main(): Promise<void> {
  await loadTemplates("templates");
  const profile = await loadProfile();
  const { values } = parseArgs({
    options: { theme: { type: "string", default: DEFAULT_THEME }, root: { type: "string", default: "." } },
  });
  const themeOpt = values.theme;
  const t = await loadTheme(themeOpt === undefined ? DEFAULT_THEME : themeOpt);
  const rootOpt = values.root;
  const root = rootOpt === undefined ? "." : rootOpt;
  configureSky(profile.lat, profile.lon, profile.tz);

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
  const updated = calendar === null ? "" : need(last(calendar, "calendar")[0], "updated");
  const nCards = Math.min(profile.maxCards, s.projects.length - (s.projects.length % 2));
  const carded = s.projects.slice(0, nCards);
  const rest = s.projects.slice(nCards);
  let n = 0;
  const counter = (): string => `// ${String(++n).padStart(2, "0")}`;
  const head = (name: string, cmd: string, comment = ""): Promise<[string, string]> => {
    const c = counter();
    return Promise.all([sectionHead(t, name, c, cmd, comment), phoneSectionHead(t, name, c, cmd, comment)]);
  };

  const page = new Page();
  page.raw = `https://github.com/${profile.profileRepo}/raw/main/assets`;
  const headerPair = await header(t, s, profile);
  const phoneHeaderPair = await phoneHeader(t, s, profile);
  page.add("header.svg", [headerPair[0], phoneHeaderPair[0]], "100%", headerAlt(s, profile), null);
  page.add("header-site.svg", [headerPair[1], phoneHeaderPair[1]], "100%", "Personal site and profile", profile.siteUrl);
  const links = linkButtons(t, profile);
  page.add("links.svg", await head("links", `ping ${profile.login} --all-channels`), "100%", "Links", null);
  for (const entry of links.entries()) {
    const b = need(entry[1], "link");
    page.add(
      `links/${entry[0] + 1}.svg`,
      await Promise.all([button(t, b, entry[0], links.length), phoneButton(t, b, entry[0], links.length)]),
      `${100 / links.length}%`,
      b.label,
      b.url,
      entry[0] > 0,
    );
  }

  if (starData !== null) {
    const found = trends(t, starData, s.projects, profile.tuning);
    if (found.rows.length >= 3) {
      const c = counter();
      page.add(
        "trending.svg",
        await Promise.all([
          trendingHead(t, profile, starData, found.days, c),
          phoneTrendingHead(t, profile, starData, found.days, c),
        ]),
        "100%",
        `Trending: stars gained by ${profile.login}'s repos in the ${found.days} days to ${starData.end}`,
        null,
      );
      const top = need(found.rows[0], "top trend").gain;
      for (const rowEntry of found.rows.entries()) {
        const r = need(rowEntry[1], "trend row");
        page.add(
          `trending/${rowEntry[0] + 1}.svg`,
          await Promise.all([trendingRow(t, r, rowEntry[0], top), phoneTrendingRow(t, r, rowEntry[0], top)]),
          "100%",
          `${r.p.name}: +${r.gain} stars in ${found.days} days${r.isNew ? " (new)" : ""}, ${r.total} total`,
          r.p.href,
        );
      }
      page.add(
        "trending/legend.svg",
        await Promise.all([trendingLegend(t), phoneTrendingLegend(t)]),
        "100%",
        "Legend",
        null,
      );
    }
  }
  {
    const c = counter();
    page.add(
      "stats.svg",
      await Promise.all([stats(t, s, profile, updated, c), phoneStats(t, s, profile, updated, c)]),
      "100%",
      "Stats",
      null,
    );
  }
  if (calendar !== null) {
    const c = counter();
    page.add(
      "contribution-city.svg",
      await Promise.all([city(t, calendar, profile, updated, c), phoneCity(t, calendar, profile, updated, c)]),
      "100%",
      cityAlt(calendar, profile.login),
      null,
    );
  }

  if (s.projects.length > 0) {
    page.add("projects.svg", await head("projects", "ls -l ~/projects"), "100%", "Projects", null);
    for (const cardEntry of carded.entries()) {
      const p = need(cardEntry[1], "project card");
      const side = cardEntry[0] % 2 === 0 ? "L" : "R";
      page.add(
        `projects/${slugOf(p.name)}.svg`,
        await Promise.all([
          card(t, p, side, 0.3 + cardEntry[0] * 0.12),
          phoneCard(t, p, side, 0.3 + cardEntry[0] * 0.12),
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
          icon: logo === null ? "" : render("logo-img", { href: logo }),
        });
        page.add(
          `projects/also-${slugOf(p.name)}.svg`,
          await Promise.all([button(t, b, k, group.length, 0.3), phoneButton(t, b, k, group.length, 0.3)]),
          `${100 / group.length}%`,
          `${p.name}: ${p.description}`,
          p.href,
          k > 0,
        );
      }
    }
  }
  page.add(
    "footer.svg",
    await Promise.all([footer(t, profile), phoneFooter(t, profile)]),
    "100%",
    "Connection closed.",
    CREDIT_URL,
  );

  await rm(`${root}/assets`, { recursive: true, force: true });
  for (const file of page.files) {
    const path = `${root}/assets/${need(file[0], "asset name")}`;
    await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
    await writeFile(path, need(file[1], `asset ${file[0]}`));
  }
  await writeFile(`${root}/README.md`, page.readme(profile));
  console.log(`rendered ${page.files.size} SVGs (${t.name}) and README.md into ${root}`);
}

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

await main();
