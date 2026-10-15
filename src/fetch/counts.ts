import { z } from "zod";
import {
  countSchema,
  profileSchema,
  projectSchema,
  repoMetaSchema,
  searchCountSchema,
  searchResponseSchema,
  starsSchema,
} from "../schemas.ts";
import { GitHubClient, describeError, logWarning } from "./client.ts";

const RELEASE_TITLE = /^chore(\([^)]*\))?: release\b/i;

export async function searchGitHubIssues(
  q: string,
  client: GitHubClient,
): Promise<{ total: number; items: z.infer<typeof searchResponseSchema>["items"] }> {
  const items: z.infer<typeof searchResponseSchema>["items"] = [];
  let total = 0;
  for (let page = 1; page <= 10; page++) {
    const res = await client.github(
      searchResponseSchema,
      `search/issues?q=${encodeURIComponent(q)}&per_page=100&page=${page}`,
    );
    total = res.total_count;
    for (const item of res.items) items.push(item);
    if (items.length >= total || res.items.length < 100) break;
  }
  return { total, items };
}

export function isAutomatedGitHubAccount(login: string, accountType: string): boolean {
  if (accountType.toLowerCase() === "bot") return true;
  return login.toLowerCase().endsWith("[bot]");
}

export async function fetchOpenIssueOrPullRequestCount(
  kind: "issue" | "pr",
  client: GitHubClient,
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
  const found = await searchGitHubIssues(base.join(" "), client);
  const kept = found.items.filter((item) => !isAutomatedGitHubAccount(item.user.login, item.user.type) && !(kind === "pr" && RELEASE_TITLE.test(item.title)));
  const bots: string[] = [];
  for (const item of found.items) {
    if (isAutomatedGitHubAccount(item.user.login, item.user.type) && !bots.some((login) => login.toLowerCase() === item.user.login.toLowerCase())) bots.push(item.user.login);
  }
  bots.sort();
  const query = [
    ...base,
    ...bots.map((b) => (b.toLowerCase().endsWith("[bot]") ? `-author:app/${b.slice(0, -5)}` : `-author:${b}`)),
    ...(kind === "pr" ? ['NOT "chore: release" in:title'] : []),
  ].join(" ");
  const linked = await client.github(
    searchCountSchema,
    `search/issues?q=${encodeURIComponent(query)}&per_page=1`,
  );
  if (linked.total_count !== kept.length) {
    logWarning(`${kind} count`, `${kept.length} counted but its linked search shows ${linked.total_count}`);
  }
  return { count: kept.length, query };
}

export function sortDailyCountsByDate(dailyCounts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(dailyCounts).sort(([dateA], [dateB]) => dateA.localeCompare(dateB)));
}

export async function collectRepositoryStarHistory(
  repo: string,
  prev: { created_at: string; total: number; daily: Record<string, number> } | null,
  today: string,
  client: GitHubClient,
): Promise<{ created_at: string; total: number; daily: Record<string, number> }> {
  const info = await client.github(repoMetaSchema, `repos/${repo}`);
  const created_at = info.created_at.slice(0, 10);
  const total = info.stargazers_count;
  if (process.env["PROFILE_TOKEN"] !== undefined) {
    try {
      return { created_at, total, daily: sortDailyCountsByDate(await client.stargazerDays(repo)) };
    } catch (err) {
      logWarning(`stargazers for ${repo}`, `${describeError(err)}; tracking the star count instead`);
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
  return { created_at, total, daily: sortDailyCountsByDate(daily) };
}

export async function collectRepositoryStarHistories(
  projects: z.infer<typeof projectSchema>[],
  today: string,
  previous: z.infer<typeof starsSchema> | null,
  client: GitHubClient,
): Promise<z.infer<typeof starsSchema>> {
  const repos: Record<string, { created_at: string; total: number; daily: Record<string, number> }> = {};
  let ok = 0;
  for (const p of projects) {
    const stored = previous === null ? null : Object.entries(previous.repos).find(([repo]) => repo.toLowerCase() === p.repo.toLowerCase())?.[1];
    const kept = stored === undefined ? null : stored;
    try {
      repos[p.repo] = await collectRepositoryStarHistory(p.repo, kept, today, client);
      ok++;
    } catch (err) {
      logWarning(`stargazers for ${p.repo}`, `keeping the last value: ${describeError(err)}`);
      if (kept !== null) repos[p.repo] = kept;
    }
  }
  if (ok === 0 && projects.length > 0) throw new Error("no stargazer data");
  return { end: today, repos };
}
