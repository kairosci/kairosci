import { z } from "zod";
import {
  countSchema,
  profileSchema,
  projectSchema,
  repoMetaSchema,
  searchCountSchema,
  searchResponseSchema,
  starsSchema,
  stargazerListSchema,
} from "../schemas.ts";
import { errMsg, get, github, warn } from "./client.ts";

const RELEASE_TITLE = /^chore(\([^)]*\))?: release\b/i;

export async function search(
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

export function isBot(login: string, kind: string): boolean {
  if (kind === "Bot") return true;
  return login.endsWith("[bot]");
}

export async function fetchCount(
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

export async function listStargazers(
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

export function sortDays(daily: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(daily).sort(([a], [b]) => a.localeCompare(b)));
}

export async function repoStars(
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

export async function fetchStarHistory(
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
