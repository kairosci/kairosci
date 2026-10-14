import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { last, need } from "./defined.ts";
import { loadProfile } from "./profile.ts";
import {
  calendarSchema,
  countSchema,
  gqlEnvelopeSchema,
  gqlProfileSchema,
  gqlYearsSchema,
  profileSchema,
  projectSchema,
  repoMetaSchema,
  repoStatsSchema,
  searchCountSchema,
  searchResponseSchema,
  snapshotSchema,
  starsSchema,
  stargazerListSchema,
  userBioSchema,
} from "./schemas.ts";

const RELEASE_TITLE = /^chore(\([^)]*\))?: release\b/i;

const token = process.env["GITHUB_TOKEN"];

function warn(title: string, message: string): void {
  const actions = process.env["GITHUB_ACTIONS"];
  if (actions === undefined) console.warn(`warn: ${title}: ${message}`);
  else console.warn(`::warning title=${title}::${message}`);
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function get(url: string, headers: Record<string, string>): Promise<Response> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

async function github<S extends z.ZodType>(
  schema: S,
  path: string,
  agent: string,
): Promise<z.infer<S>> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": agent,
    "x-github-api-version": "2022-11-28",
  };
  if (token !== undefined) headers["authorization"] = `Bearer ${token}`;
  const res = await get(`https://api.github.com/${path}`, headers);
  return schema.parse(await res.json());
}

function fmtStars(n: number): string {
  if (n >= 1000) {
    const v = n / 1000;
    return Number.isInteger(v) ? String(v) : `${v.toFixed(1)}k`;
  }
  return String(n);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function buildProjects(
  repos: Record<string, z.infer<typeof repoStatsSchema>>,
  intro: string,
  profile: z.infer<typeof profileSchema>,
): {
  intro: string;
  projects: z.infer<typeof projectSchema>[];
  posts: never[];
  upstreamRepos: number;
  upstreamStars: number;
  langCounts: Record<string, number>;
} {
  const rows = Object.entries(repos).map((entry) => ({ full: need(entry[0], "repo"), ...need(entry[1], `stats for ${entry[0]}`) }));
  const earned = rows.filter(
    (r) => !r.mine && !r.fork && !r.archived && !r.private && r.commits > 0 && r.description !== null && r.description.trim() !== "",
  );
  earned.sort(
    (a, b) => b.commits - a.commits || b.prs - a.prs || b.stars - a.stars || a.full.localeCompare(b.full),
  );
  let upstreamStars = 0;
  const langCounts: Record<string, number> = {};
  for (const r of earned) {
    upstreamStars += r.stars;
    if (r.lang !== null) {
      const prev = langCounts[r.lang];
      langCounts[r.lang] = prev === undefined ? 1 : prev + 1;
    }
  }
  const projects = earned.slice(0, profile.maxProjects).map((r) => {
    const parts = r.full.split("/");
    const name = need(parts[1], `repo of ${r.full}`);
    const language = r.lang === null ? "Code" : r.lang;
    return {
      name,
      repo: r.full,
      kind: language,
      description: need(r.description, `description of ${r.full}`).trim(),
      tagline: `${plural(r.commits, "commit", "commits")} · ${plural(r.prs, "PR", "PRs")}`,
      install: `gh repo clone ${r.full}`,
      stars: fmtStars(r.stars),
      href: r.url,
      logo: "",
    };
  });
  return { intro, projects, posts: [], upstreamRepos: earned.length, upstreamStars, langCounts };
}

const profileTokenEnv = process.env["PROFILE_TOKEN"];
let graphqlToken = profileTokenEnv === undefined ? token : profileTokenEnv;

async function graphql<S extends z.ZodType>(
  schema: S,
  query: string,
  variables: Record<string, string>,
  profile: z.infer<typeof profileSchema>,
  attempt = 1,
): Promise<z.infer<S>> {
  if (graphqlToken === undefined) throw new Error("GraphQL needs GITHUB_TOKEN or PROFILE_TOKEN");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `bearer ${graphqlToken}`,
      "content-type": "application/json",
      "user-agent": profile.userAgent,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(60_000),
  });
  if ((res.status === 401 || res.status === 403) && graphqlToken !== token && token !== undefined) {
    warn("PROFILE_TOKEN", `GraphQL returned HTTP ${res.status}; using GITHUB_TOKEN (public contributions only)`);
    graphqlToken = token;
    return graphql(schema, query, variables, profile);
  }
  if (res.status >= 500 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 3000 * attempt));
    return graphql(schema, query, variables, profile, attempt + 1);
  }
  if (!res.ok) throw new Error(`GraphQL: HTTP ${res.status}`);
  const envelope = gqlEnvelopeSchema.parse(await res.json());
  if (envelope.errors !== undefined && envelope.errors.length > 0) {
    throw new Error(`GraphQL: ${envelope.errors.map((e) => e.message).join("; ")}`);
  }
  return schema.parse(envelope.data);
}

const PROFILE_QUERY = `query($login: String!) {
  user(login: $login) {
    createdAt
    followers { totalCount }
    repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) { totalCount }
    pullRequests { totalCount }
    merged: pullRequests(states: MERGED) { totalCount }
    contributionsCollection { contributionYears }
  }
}`;

function iso(d: Date): string {
  return need(d.toISOString().slice(0, 10), "iso date");
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 864e5);
}

function streaks(days: Map<string, number>, today: Date): [number, number] {
  let longest = 0;
  let run = 0;
  const keys = [...days.keys()].filter((d) => d <= iso(today)).sort();
  for (const d of keys) {
    const count = days.get(d);
    run = count !== undefined && count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let current = 0;
  let d = today;
  if (days.get(iso(d)) === undefined) d = addDays(d, -1);
  while (true) {
    const count = days.get(iso(d));
    if (count === undefined || count <= 0) break;
    current++;
    d = addDays(d, -1);
  }
  return [current, longest];
}

async function fetchGitHub(
  today: Date,
  profile: z.infer<typeof profileSchema>,
): Promise<{
  github: z.infer<typeof snapshotSchema>["github"];
  calendar: z.infer<typeof calendarSchema>;
  repos: Record<string, z.infer<typeof repoStatsSchema>>;
}> {
  const data = await graphql(gqlProfileSchema, PROFILE_QUERY, { login: profile.login }, profile);
  const user = data.user;
  const years = [...user.contributionsCollection.contributionYears].sort();
  const collected: Record<string, z.infer<typeof gqlYearsSchema>["user"][string]> = {};
  for (let i = 0; i < years.length; i += 4) {
    const query = `query($login: String!) { user(login: $login) {${years
      .slice(i, i + 4)
      .map(
        (y) => `
    y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") {
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
      commitContributionsByRepository(maxRepositories: 100) {
        contributions(first: 1) { totalCount }
        repository { nameWithOwner description stargazerCount url primaryLanguage { name } isFork isArchived isPrivate }
      }
      pullRequestContributionsByRepository(maxRepositories: 100) {
        contributions(first: 1) { totalCount }
        repository { nameWithOwner description stargazerCount url primaryLanguage { name } isFork isArchived isPrivate }
      }
    }`,
      )
      .join("")}
  } }`;
    const chunk = await graphql(gqlYearsSchema, query, { login: profile.login }, profile);
    for (const entry of Object.entries(chunk.user)) {
      collected[need(entry[0], "year key")] = need(entry[1], `year ${entry[0]}`);
    }
  }

  const days = new Map<string, number>();
  let all = 0;
  const repos: Record<string, z.infer<typeof repoStatsSchema>> = {};
  const slotFor = (full: string): z.infer<typeof repoStatsSchema> => {
    const slot = repos[full];
    if (slot !== undefined) return slot;
    const fresh = repoStatsSchema.parse({
      commits: 0,
      prs: 0,
      description: null,
      stars: 0,
      url: `https://github.com/${full}`,
      lang: null,
      fork: false,
      archived: false,
      private: false,
      mine: full.startsWith(`${profile.login}/`),
    });
    repos[full] = fresh;
    return fresh;
  };
  const fillMeta = (
    slot: z.infer<typeof repoStatsSchema>,
    r: {
      description: string | null;
      stargazerCount: number;
      url: string;
      primaryLanguage: { name: string } | null;
      isFork: boolean;
      isArchived: boolean;
      isPrivate: boolean;
    },
  ): void => {
    slot.description = r.description;
    slot.stars = r.stargazerCount;
    slot.url = r.url;
    slot.lang = r.primaryLanguage === null ? null : r.primaryLanguage.name;
    slot.fork = r.isFork;
    slot.archived = r.isArchived;
    slot.private = r.isPrivate;
  };
  for (const y of years) {
    const entry = collected[`y${y}`];
    if (entry === undefined) throw new Error(`missing contributions for ${y}`);
    all += entry.contributionCalendar.totalContributions;
    for (const w of entry.contributionCalendar.weeks) {
      for (const day of w.contributionDays) days.set(day.date, day.contributionCount);
    }
    for (const c of entry.commitContributionsByRepository) {
      const slot = slotFor(c.repository.nameWithOwner);
      slot.commits += c.contributions.totalCount;
      fillMeta(slot, c.repository);
    }
    for (const c of entry.pullRequestContributionsByRepository) {
      const slot = slotFor(c.repository.nameWithOwner);
      slot.prs += c.contributions.totalCount;
      fillMeta(slot, c.repository);
    }
  }
  const streak = streaks(days, today);
  let start = addDays(today, -52 * 7);
  start = addDays(start, -start.getUTCDay());
  const calendar: z.infer<typeof calendarSchema> = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const count = days.get(iso(d));
    calendar.push([iso(d), count === undefined ? 0 : count]);
  }

  const year = today.getUTCFullYear();
  const thisYear = collected[`y${year}`];
  return {
    calendar,
    repos,
    github: {
      created_at: user.createdAt,
      followers: user.followers.totalCount,
      public_repos: user.repositories.totalCount,
      prs: user.pullRequests.totalCount,
      prs_merged: user.merged.totalCount,
      year,
      contributions_year: thisYear === undefined ? 0 : thisYear.contributionCalendar.totalContributions,
      contributions_all: all,
      streak_current: need(streak[0], "streak"),
      streak_longest: need(streak[1], "streak"),
      languages: {},
    },
  };
}

async function search(
  q: string,
  profile: z.infer<typeof profileSchema>,
): Promise<{ total: number; items: z.infer<typeof searchResponseSchema>["items"] }> {
  const items: z.infer<typeof searchResponseSchema>["items"] = [];
  let total = 0;
  for (let page = 1; page <= 10; page++) {
    const res = await github(
      searchResponseSchema,
      `search/issues?q=${encodeURIComponent(q)}&per_page=100&page=${page}`,
      profile.userAgent,
    );
    total = res.total_count;
    for (const item of res.items) items.push(item);
    if (items.length >= total || res.items.length < 100) break;
  }
  return { total, items };
}

function isBot(login: string, kind: string): boolean {
  if (kind === "Bot") return true;
  return login.endsWith("[bot]");
}

async function fetchCount(
  kind: "issue" | "pr",
  profile: z.infer<typeof profileSchema>,
): Promise<z.infer<typeof countSchema>> {
  const base = [
    `author:${profile.login}`,
    "is:public",
    "archived:false",
    "is:open",
    `is:${kind}`,
    ...(kind === "pr" ? ["draft:false"] : []),
  ];
  const found = await search(base.join(" "), profile);
  const kept = found.items.filter((i) => !isBot(i.user.login, i.user.type) && !(kind === "pr" && RELEASE_TITLE.test(i.title)));
  const bots: string[] = [];
  for (const i of found.items) {
    if (isBot(i.user.login, i.user.type) && !bots.includes(i.user.login)) bots.push(i.user.login);
  }
  bots.sort();
  const query = [
    ...base,
    ...bots.map((b) => (b.endsWith("[bot]") ? `-author:app/${b.slice(0, -5)}` : `-author:${b}`)),
    ...(kind === "pr" ? ['NOT "chore: release" in:title'] : []),
  ].join(" ");
  const linked = await github(
    searchCountSchema,
    `search/issues?q=${encodeURIComponent(query)}&per_page=1`,
    profile.userAgent,
  );
  if (linked.total_count !== kept.length) {
    warn(`${kind} count`, `${kept.length} counted but its linked search shows ${linked.total_count}`);
  }
  return { count: kept.length, query };
}

async function listStargazers(
  repo: string,
  profile: z.infer<typeof profileSchema>,
): Promise<Record<string, number>> {
  const pat = process.env["PROFILE_TOKEN"];
  if (pat === undefined) throw new Error("stargazers need PROFILE_TOKEN");
  const daily: Record<string, number> = {};
  for (let page = 1; page <= 400; page++) {
    const res = await get(`https://api.github.com/repos/${repo}/stargazers?per_page=100&page=${page}`, {
      accept: "application/vnd.github.star+json",
      authorization: `Bearer ${pat}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": profile.userAgent,
    });
    const list = stargazerListSchema.parse(await res.json());
    for (const s of list) {
      const day = s.starred_at.slice(0, 10);
      const prev = daily[day];
      daily[day] = prev === undefined ? 1 : prev + 1;
    }
    if (list.length < 100) break;
  }
  return daily;
}

function sortDays(daily: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(daily).sort(([a], [b]) => a.localeCompare(b)));
}

async function repoStars(
  repo: string,
  prev: { created_at: string; total: number; daily: Record<string, number> } | null,
  today: string,
  profile: z.infer<typeof profileSchema>,
): Promise<{ created_at: string; total: number; daily: Record<string, number> }> {
  const info = await github(repoMetaSchema, `repos/${repo}`, profile.userAgent);
  const created_at = info.created_at.slice(0, 10);
  const total = info.stargazers_count;
  if (process.env["PROFILE_TOKEN"] !== undefined) {
    try {
      return { created_at, total, daily: sortDays(await listStargazers(repo, profile)) };
    } catch (err) {
      warn(`stargazers for ${repo}`, `${errMsg(err)}; tracking the star count instead`);
    }
  }
  const daily: Record<string, number> = prev === null ? {} : { ...prev.daily };
  if (prev === null) {
    daily[created_at] = total;
  } else {
    const known = Object.values(daily).reduce((a, b) => a + b, 0);
    const before = daily[today];
    daily[today] = (before === undefined ? 0 : before) + total - known;
    if (daily[today] === 0) delete daily[today];
  }
  return { created_at, total, daily: sortDays(daily) };
}

async function fetchStarHistory(
  projects: z.infer<typeof projectSchema>[],
  today: string,
  previous: z.infer<typeof starsSchema> | null,
  profile: z.infer<typeof profileSchema>,
): Promise<z.infer<typeof starsSchema>> {
  const repos: Record<string, { created_at: string; total: number; daily: Record<string, number> }> = {};
  let ok = 0;
  for (const p of projects) {
    const stored = previous === null ? null : previous.repos[p.repo];
    const kept = stored === undefined ? null : stored;
    try {
      repos[p.repo] = await repoStars(p.repo, kept, today, profile);
      ok++;
    } catch (err) {
      warn(`stargazers for ${p.repo}`, `keeping the last value: ${errMsg(err)}`);
      if (kept !== null) repos[p.repo] = kept;
    }
  }
  if (ok === 0 && projects.length > 0) throw new Error("no stargazer data");
  return { end: today, repos };
}

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
  const gh = await attempt("github", () => fetchGitHub(today, profile), null);
  const built = gh === null ? null : buildProjects(gh.repos, intro, profile);
  const prevGhLangs = previous.github === null ? {} : previous.github.languages;
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
            created_at: ghGithub.created_at,
            followers: ghGithub.followers,
            public_repos: ghGithub.public_repos,
            prs: ghGithub.prs,
            prs_merged: ghGithub.prs_merged,
            year: ghGithub.year,
            contributions_year: ghGithub.contributions_year,
            contributions_all: ghGithub.contributions_all,
            streak_current: ghGithub.streak_current,
            streak_longest: ghGithub.streak_longest,
            languages: built === null ? prevGhLangs : built.langCounts,
          },
  });
  if (failures === 4) throw new Error("every source failed; leaving data/ untouched");

  await writeFile("data/snapshot.json", `${JSON.stringify(snapshot, null, "\t")}\n`);
  if (gh !== null) await writeFile("data/calendar.json", `${JSON.stringify(gh.calendar)}\n`);

  const prevStarsRaw = await readJson("data/stars.json");
  let prevStars: z.infer<typeof starsSchema> | null = null;
  try {
    prevStars = prevStarsRaw === null ? null : starsSchema.parse(prevStarsRaw);
  } catch {
    prevStars = null;
  }
  const stars = await attempt("star history", () => fetchStarHistory(snapshot.projects, iso(today), prevStars, profile), null);
  if (stars !== null) await writeFile("data/stars.json", `${JSON.stringify(stars)}\n`);

  if (gh === null) {
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
      `stars ${snapshot.stars === null ? "—" : String(snapshot.stars)} · ` +
      `issues ${snapshot.issues === null ? "—" : String(snapshot.issues.count)} · ` +
      `prs ${snapshot.prs === null ? "—" : String(snapshot.prs.count)} · ` +
      `contributions ${ghStats === null ? "—" : String(ghStats.contributions_year)}/${ghStats === null ? "—" : String(ghStats.contributions_all)} · ` +
      `streak ${ghStats === null ? "—" : String(ghStats.streak_current)}/${ghStats === null ? "—" : String(ghStats.streak_longest)}`,
  );
}

if (import.meta.main) await main();
