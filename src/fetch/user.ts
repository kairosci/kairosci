import { z } from "zod";
import { need } from "../defined.ts";
import {
  calendarSchema,
  gqlProfileSchema,
  gqlYearsSchema,
  profileSchema,
  projectSchema,
  repoSearchItemSchema,
  repoSearchSchema,
  repoStatsSchema,
  snapshotSchema,
} from "../schemas.ts";
import { GitHubClient, errMsg, warn } from "./client.ts";
import { search } from "./counts.ts";
import { pause } from "./emails.ts";

export function isMine(full: string, profile: z.infer<typeof profileSchema>): boolean {
  const lower = full.toLowerCase();
  for (const login of [profile.login, ...profile.extraLogins]) {
    if (lower.startsWith(`${login.toLowerCase()}/`)) return true;
  }
  return false;
}

async function searchRepoName(
  client: GitHubClient,
  name: string,
): Promise<z.infer<typeof repoSearchItemSchema> | null> {
  await pause();
  const res = await client.github(
    repoSearchSchema,
    `search/repositories?q=${encodeURIComponent(`${name} in:name`)}&sort=stars&order=desc&per_page=100`,
  );
  let best: z.infer<typeof repoSearchItemSchema> | null = null;
  for (const item of res.items) {
    const itemName = item.full_name.split("/");
    const short = need(itemName[1], `repo of ${item.full_name}`);
    const matches = short.toLowerCase() === name.toLowerCase();
    if (!matches) continue;
    if (best === null || item.stargazers_count > best.stargazers_count) best = item;
  }
  if (best === null) warn("extra repo", `${name}: no match, skipped`);
  return best;
}

async function resolveOne(
  client: GitHubClient,
  given: string,
): Promise<z.infer<typeof repoSearchItemSchema> | null> {
  const trimmed = given.trim();
  if (trimmed === "") {
    warn("extra repo", "empty entry, skipped");
    return null;
  }
  if (trimmed.includes("/")) {
    return client.github(repoSearchItemSchema, `repos/${trimmed}`);
  }
  return searchRepoName(client, trimmed);
}

export async function resolveExtraRepos(
  repos: Record<string, z.infer<typeof repoStatsSchema>>,
  client: GitHubClient,
  profile: z.infer<typeof profileSchema>,
): Promise<void> {
  for (const given of profile.extraRepos) {
    try {
      const found = await resolveOne(client, given);
      if (found === null) continue;
      if (Object.keys(repos).some((full) => full.toLowerCase() === found.full_name.toLowerCase())) continue;
      await pause();
      let prs = 0;
      try {
        for (const login of new Set([profile.login, ...profile.extraLogins].map((login) => login.toLowerCase()))) {
          const res = await search(`author:${login} type:pr repo:${found.full_name}`, client);
          prs += res.total;
        }
      } catch (err) {
        warn(`extra repo prs for ${found.full_name}`, errMsg(err));
      }
      repos[found.full_name] = repoStatsSchema.parse({
        commits: 0,
        prs,
        description: found.description,
        stars: found.stargazers_count,
        url: found.html_url,
        lang: found.language,
        fork: found.fork,
        archived: found.archived,
        private: found.private,
        mine: isMine(found.full_name, profile),
      });
    } catch (err) {
      warn(`extra repo ${given}`, errMsg(err));
    }
  }
}

const PROFILE_QUERY = `query($login: String!) {
  user(login: $login) {
    createdAt
    repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) { totalCount }
    pullRequests { totalCount }
    merged: pullRequests(states: MERGED) { totalCount }
    contributionsCollection { contributionYears }
  }
}`;

export function iso(d: Date): string {
  return need(d.toISOString().slice(0, 10), "iso date");
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 864e5);
}

export function streaks(days: Map<string, number>, today: Date): [number, number] {
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

export function fmtStars(n: number): string {
  if (n >= 1000) {
    const v = n / 1000;
    return Number.isInteger(v) ? String(v) : `${v.toFixed(1)}k`;
  }
  return String(n);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function buildProjects(
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
    (a, b) => b.commits - a.commits || b.stars - a.stars || a.full.localeCompare(b.full),
  );
  const qualified = earned.filter((r) => r.commits >= profile.tuning.minCommits && r.stars >= profile.tuning.minStars);
  let upstreamStars = 0;
  const langCounts: Record<string, number> = {};
  for (const r of qualified) {
    upstreamStars += r.stars;
    if (r.lang !== null) {
      const prev = langCounts[r.lang];
      langCounts[r.lang] = prev === undefined ? r.commits : prev + r.commits;
    }
  }
  const projects = qualified.slice(0, profile.maxProjects).map((r) => {
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
  return { intro, projects, posts: [], upstreamRepos: qualified.length, upstreamStars, langCounts };
}

export async function fetchGitHub(
  today: Date,
  login: string,
  client: GitHubClient,
  profile: z.infer<typeof profileSchema>,
): Promise<{
  github: z.infer<typeof snapshotSchema>["github"];
  calendar: z.infer<typeof calendarSchema>;
  repos: Record<string, z.infer<typeof repoStatsSchema>>;
}> {
  const data = await client.graphql(gqlProfileSchema, PROFILE_QUERY, { login });
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
    const chunk = await client.graphql(gqlYearsSchema, query, { login });
    for (const entry of Object.entries(chunk.user)) {
      collected[need(entry[0], "year key")] = need(entry[1], `year ${entry[0]}`);
    }
  }

  const days = new Map<string, number>();
  let all = 0;
  const repos: Record<string, z.infer<typeof repoStatsSchema>> = {};
  const slotFor = (full: string): z.infer<typeof repoStatsSchema> => {
    const key = Object.keys(repos).find((name) => name.toLowerCase() === full.toLowerCase());
    const slot = key === undefined ? undefined : repos[key];
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
      mine: isMine(full, profile),
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
