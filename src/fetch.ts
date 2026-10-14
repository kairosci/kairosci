import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { last, need } from "./defined.ts";
import { GitHubClient, errMsg, warn } from "./fetch/client.ts";
import { fetchCount, fetchStarHistory } from "./fetch/counts.ts";
import { enrichWithEmails } from "./fetch/emails.ts";
import { buildProjects, fetchGitHub, iso, resolveExtraRepos, streaks } from "./fetch/user.ts";
import { loadProfile } from "./profile.ts";
import { calendarSchema, profileSchema, snapshotSchema, starsSchema, userBioSchema } from "./schemas.ts";

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function emptySnapshot(): z.infer<typeof snapshotSchema> {
  return { intro: "", projects: [], posts: [], upstreamRepos: 0, stars: null, issues: null, prs: null, github: null };
}

export class ProfileFetcher {
  private failures = 0;
  private client: GitHubClient;
  private profile: z.infer<typeof profileSchema>;

  constructor(client: GitHubClient, profile: z.infer<typeof profileSchema>) {
    this.client = client;
    this.profile = profile;
  }

  async run(): Promise<void> {
    const profile = this.profile;
    await mkdir("data", { recursive: true });
    const previous = await this.readPrevious();
    const today = new Date(`${need(new Date().toISOString().slice(0, 10), "today")}T00:00:00Z`);
    const intro = await this.fetchBio(previous);
    const gh = await this.attempt("github", () => fetchGitHub(today, profile.login, this.client, profile), null);
    const extraData = await this.fetchExtras(today);
    let trackedEmails: string[] = [];
    if (gh !== null) {
      await resolveExtraRepos(gh.repos, this.client, profile);
      trackedEmails = await enrichWithEmails(gh.repos, this.client, profile);
    }
    const built = gh === null ? null : buildProjects(gh.repos, intro, profile);
    const merged = this.mergeAll(today, gh, extraData);
    const snapshot = snapshotSchema.parse({
      intro,
      projects: built === null ? previous.projects : built.projects,
      posts: [],
      upstreamRepos: built === null ? previous.upstreamRepos : built.upstreamRepos,
      stars: built === null ? previous.stars : built.upstreamStars,
      issues: await this.attempt("issues", () => fetchCount("issue", this.client, profile), previous.issues),
      prs: await this.attempt("prs", () => fetchCount("pr", this.client, profile), previous.prs),
      github: this.mergeGithub(gh === null ? previous.github : gh.github, merged, built, previous),
    });
    if (this.failures === 4) throw new Error("every source failed; leaving data/ untouched");

    await writeFile("data/snapshot.json", `${JSON.stringify(snapshot, null, "\t")}\n`);
    if (merged.mergedCal !== null) await writeFile("data/calendar.json", `${JSON.stringify(merged.mergedCal)}\n`);

    await this.updateStars(snapshot, today);
    await this.guardFreshness(today, merged.mergedCal);
    this.logSummary(snapshot, trackedEmails);
  }

  private async attempt<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      this.failures++;
      warn(`${name} fetch failed`, `keeping the last value: ${errMsg(err)}`);
      return fallback;
    }
  }

  private async readPrevious(): Promise<z.infer<typeof snapshotSchema>> {
    try {
      const prevRaw = await readJson("data/snapshot.json");
      return prevRaw === null ? emptySnapshot() : snapshotSchema.parse(prevRaw);
    } catch {
      return emptySnapshot();
    }
  }

  private async fetchBio(previous: z.infer<typeof snapshotSchema>): Promise<string> {
    const profile = this.profile;
    return this.attempt("bio", async () => {
      const u = await this.client.github(userBioSchema, `users/${profile.login}`);
      return u.bio === null ? previous.intro : u.bio;
    }, previous.intro);
  }

  private async fetchExtras(
    today: Date,
  ): Promise<{ github: z.infer<typeof snapshotSchema>["github"]; calendar: z.infer<typeof calendarSchema> }[]> {
    const profile = this.profile;
    const extraData: { github: z.infer<typeof snapshotSchema>["github"]; calendar: z.infer<typeof calendarSchema> }[] = [];
    for (const login of profile.extraLogins) {
      try {
        await this.client.github(userBioSchema, `users/${login}`);
      } catch {
        warn(login, "account unreachable, skipped");
        continue;
      }
      try {
        extraData.push(await fetchGitHub(today, login, this.client, profile));
      } catch (err) {
        warn(login, `fetch failed, skipped: ${errMsg(err)}`);
      }
    }
    return extraData;
  }

  private mergeAll(
    today: Date,
    gh: {
      github: z.infer<typeof snapshotSchema>["github"];
      calendar: z.infer<typeof calendarSchema>;
    } | null,
    extraData: { github: z.infer<typeof snapshotSchema>["github"]; calendar: z.infer<typeof calendarSchema> }[],
  ): {
    mergedCal: z.infer<typeof calendarSchema> | null;
    mergedStreak: [number, number] | null;
    extraYear: number;
    extraAll: number;
    firstSeen: string | null;
  } {
    if (gh === null) {
      return { mergedCal: null, mergedStreak: null, extraYear: 0, extraAll: 0, firstSeen: null };
    }
    const dayTotals = new Map<string, number>();
    const addCal = (cal: z.infer<typeof calendarSchema>): void => {
      for (const entry of cal) {
        const day = need(entry[0], "day");
        const count = need(entry[1], "count");
        const prev = dayTotals.get(day);
        dayTotals.set(day, prev === undefined ? count : prev + count);
      }
    };
    addCal(gh.calendar);
    for (const extra of extraData) addCal(extra.calendar);
    const mergedCal = [...dayTotals]
      .sort((a, b) => need(a[0], "day").localeCompare(need(b[0], "day")))
      .map((entry): [string, number] => [need(entry[0], "day"), need(entry[1], "count")]);
    const mergedStreak = streaks(dayTotals, today);
    const extraYear = extraData.reduce((a, e) => a + (e.github === null ? 0 : e.github.contributions_year), 0);
    const extraAll = extraData.reduce((a, e) => a + (e.github === null ? 0 : e.github.contributions_all), 0);
    const createdDates = [
      ...(gh.github === null ? [] : [gh.github.created_at]),
      ...extraData.flatMap((e) => (e.github === null ? [] : [e.github.created_at])),
    ].sort();
    return {
      mergedCal,
      mergedStreak,
      extraYear,
      extraAll,
      firstSeen: createdDates.length === 0 ? null : need(createdDates[0], "created date"),
    };
  }

  private mergeGithub(
    ghGithub: z.infer<typeof snapshotSchema>["github"],
    merged: {
      mergedStreak: [number, number] | null;
      extraYear: number;
      extraAll: number;
      firstSeen: string | null;
    },
    built: {
      intro: string;
      projects: z.infer<typeof snapshotSchema>["projects"];
      posts: never[];
      upstreamRepos: number;
      upstreamStars: number;
      langCounts: Record<string, number>;
    } | null,
    previous: z.infer<typeof snapshotSchema>,
  ): z.infer<typeof snapshotSchema>["github"] {
    if (ghGithub === null) return null;
    const prevGhLangs = previous.github === null ? {} : previous.github.languages;
    return {
      created_at: merged.firstSeen === null ? ghGithub.created_at : merged.firstSeen,
      public_repos: ghGithub.public_repos,
      prs: ghGithub.prs,
      prs_merged: ghGithub.prs_merged,
      year: ghGithub.year,
      contributions_year: ghGithub.contributions_year + merged.extraYear,
      contributions_all: ghGithub.contributions_all + merged.extraAll,
      streak_current: merged.mergedStreak === null ? ghGithub.streak_current : need(merged.mergedStreak[0], "streak"),
      streak_longest: merged.mergedStreak === null ? ghGithub.streak_longest : need(merged.mergedStreak[1], "streak"),
      languages: built === null ? prevGhLangs : built.langCounts,
    };
  }

  private async updateStars(
    snapshot: z.infer<typeof snapshotSchema>,
    today: Date,
  ): Promise<void> {
    const prevStarsRaw = await readJson("data/stars.json");
    let prevStars: z.infer<typeof starsSchema> | null = null;
    try {
      prevStars = prevStarsRaw === null ? null : starsSchema.parse(prevStarsRaw);
    } catch {
      prevStars = null;
    }
    const stars = await this.attempt(
      "star history",
      () => fetchStarHistory(snapshot.projects, iso(today), prevStars, this.client),
      null,
    );
    if (stars !== null) await writeFile("data/stars.json", `${JSON.stringify(stars)}\n`);
  }

  private async guardFreshness(today: Date, mergedCal: z.infer<typeof calendarSchema> | null): Promise<void> {
    if (mergedCal !== null) return;
    const calRaw = await readJson("data/calendar.json");
    let cal: z.infer<typeof calendarSchema> | null = null;
    try {
      cal = calRaw === null ? null : calendarSchema.parse(calRaw);
    } catch {
      cal = null;
    }
    const lastDay = cal === null ? null : last(cal, "calendar")[0];
    if (lastDay === null || (today.getTime() - Date.parse(`${lastDay}T00:00:00Z`)) / 864e5 > 7) {
      process.exitCode = 1;
      console.error(`error: GitHub stats have not refreshed since ${lastDay === null ? "ever" : lastDay}`);
    }
  }

  private logSummary(snapshot: z.infer<typeof snapshotSchema>, trackedEmails: string[]): void {
    const ghStats = snapshot.github;
    console.log(
      `projects ${snapshot.projects.length} · upstream ${snapshot.upstreamRepos} repos · ` +
        `emails ${trackedEmails.length} · ` +
        `stars ${snapshot.stars === null ? "—" : String(snapshot.stars)} · ` +
        `issues ${snapshot.issues === null ? "—" : String(snapshot.issues.count)} · ` +
        `prs ${snapshot.prs === null ? "—" : String(snapshot.prs.count)} · ` +
        `contributions ${ghStats === null ? "—" : String(ghStats.contributions_year)}/${ghStats === null ? "—" : String(ghStats.contributions_all)} · ` +
        `streak ${ghStats === null ? "—" : String(ghStats.streak_current)}/${ghStats === null ? "—" : String(ghStats.streak_longest)}`,
    );
  }
}

async function main(): Promise<void> {
  const profile = await loadProfile();
  const client = new GitHubClient(profile.userAgent, process.env["GITHUB_TOKEN"], process.env["PROFILE_TOKEN"]);
  await new ProfileFetcher(client, profile).run();
}

if (import.meta.main) await main();
