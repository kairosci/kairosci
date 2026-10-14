import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { last, need } from "./defined.ts";
import { errMsg, github, warn } from "./fetch/client.ts";
import { fetchCount, fetchStarHistory } from "./fetch/counts.ts";
import { enrichWithEmails } from "./fetch/emails.ts";import { buildProjects, fetchGitHub, iso, streaks } from "./fetch/user.ts";
import { loadProfile } from "./profile.ts";
import { calendarSchema, snapshotSchema, starsSchema, userBioSchema } from "./schemas.ts";

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

async function main(): Promise<void> {
  const profile = await loadProfile();
  await mkdir("data", { recursive: true });
  const prevRaw = await readJson("data/snapshot.json");
  let previous: z.infer<typeof snapshotSchema>;
  try {
    previous = prevRaw === null ? emptySnapshot() : snapshotSchema.parse(prevRaw);
  } catch {
    previous = emptySnapshot();
  }
  let failures = 0;
  async function attempt<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      failures++;
      warn(`${name} fetch failed`, `keeping the last value: ${errMsg(err)}`);
      return fallback;
    }
  }

  const today = new Date(`${need(new Date().toISOString().slice(0, 10), "today")}T00:00:00Z`);
  const intro = await attempt("bio", async () => {
    const u = await github(userBioSchema, `users/${profile.login}`, profile.userAgent);
    return u.bio === null ? previous.intro : u.bio;
  }, previous.intro);
  const gh = await attempt("github", () => fetchGitHub(today, profile.login, profile), null);
  const extraData: { github: z.infer<typeof snapshotSchema>["github"]; calendar: z.infer<typeof calendarSchema> }[] = [];
  for (const login of profile.extraLogins) {
    try {
      await github(userBioSchema, `users/${login}`, profile.userAgent);
    } catch {
      warn(login, "account unreachable, skipped");
      continue;
    }
    try {
      extraData.push(await fetchGitHub(today, login, profile));
    } catch (err) {
      warn(login, `fetch failed, skipped: ${errMsg(err)}`);
    }
  }
  let trackedEmails: string[] = [];
  if (gh !== null) {
    trackedEmails = await enrichWithEmails(gh.repos, profile);
  }
  const built = gh === null ? null : buildProjects(gh.repos, intro, profile);  const prevGhLangs = previous.github === null ? {} : previous.github.languages;
  const dayTotals = new Map<string, number>();
  const addCal = (cal: z.infer<typeof calendarSchema>): void => {
    for (const entry of cal) {
      const day = need(entry[0], "day");
      const count = need(entry[1], "count");
      const prev = dayTotals.get(day);
      dayTotals.set(day, prev === undefined ? count : prev + count);
    }
  };
  let mergedCal: z.infer<typeof calendarSchema> | null = null;
  if (gh !== null) {
    addCal(gh.calendar);
    for (const extra of extraData) addCal(extra.calendar);
    mergedCal = [...dayTotals]
      .sort((a, b) => need(a[0], "day").localeCompare(need(b[0], "day")))
      .map((entry): [string, number] => [need(entry[0], "day"), need(entry[1], "count")]);
  }
  const mergedStreak = mergedCal === null ? null : streaks(dayTotals, today);
  const extraYear = extraData.reduce((a, e) => a + (e.github === null ? 0 : e.github.contributions_year), 0);
  const extraAll = extraData.reduce((a, e) => a + (e.github === null ? 0 : e.github.contributions_all), 0);
  const createdDates = [
    ...(gh === null || gh.github === null ? [] : [gh.github.created_at]),
    ...extraData.flatMap((e) => (e.github === null ? [] : [e.github.created_at])),
  ].sort();
  const ghGithub = gh === null ? previous.github : gh.github;
  const snapshot = snapshotSchema.parse({
    intro,
    projects: built === null ? previous.projects : built.projects,
    posts: [],
    upstreamRepos: built === null ? previous.upstreamRepos : built.upstreamRepos,
    stars: built === null ? previous.stars : built.upstreamStars,
    issues: await attempt("issues", () => fetchCount("issue", profile), previous.issues),
    prs: await attempt("prs", () => fetchCount("pr", profile), previous.prs),
    github:
      ghGithub === null
        ? null
        : {
            created_at: createdDates.length === 0 ? ghGithub.created_at : need(createdDates[0], "created date"),
            followers: ghGithub.followers,
            public_repos: ghGithub.public_repos,
            prs: ghGithub.prs,
            prs_merged: ghGithub.prs_merged,
            year: ghGithub.year,
            contributions_year: ghGithub.contributions_year + extraYear,
            contributions_all: ghGithub.contributions_all + extraAll,
            streak_current: mergedStreak === null ? ghGithub.streak_current : need(mergedStreak[0], "streak"),
            streak_longest: mergedStreak === null ? ghGithub.streak_longest : need(mergedStreak[1], "streak"),
            languages: built === null ? prevGhLangs : built.langCounts,
          },
  });
  if (failures === 4) throw new Error("every source failed; leaving data/ untouched");

  await writeFile("data/snapshot.json", `${JSON.stringify(snapshot, null, "\t")}\n`);
  if (mergedCal !== null) await writeFile("data/calendar.json", `${JSON.stringify(mergedCal)}\n`);

  const prevStarsRaw = await readJson("data/stars.json");
  let prevStars: z.infer<typeof starsSchema> | null = null;
  try {
    prevStars = prevStarsRaw === null ? null : starsSchema.parse(prevStarsRaw);
  } catch {
    prevStars = null;
  }
  const stars = await attempt("star history", () => fetchStarHistory(snapshot.projects, iso(today), prevStars, profile), null);
  if (stars !== null) await writeFile("data/stars.json", `${JSON.stringify(stars)}\n`);

  if (mergedCal === null) {
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

if (import.meta.main) await main();
