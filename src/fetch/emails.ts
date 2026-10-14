import { z } from "zod";
import { need } from "../defined.ts";
import { commitSearchSchema, eventsSchema, profileSchema, repoStatsSchema } from "../schemas.ts";
import { GitHubClient, errMsg, warn } from "./client.ts";

const SEARCH_PAUSE = 2000;
const EVENT_PAGES = 5;

export function pause(): Promise<void> {
  return new Promise((r) => setTimeout(r, SEARCH_PAUSE));
}

function looksMine(name: string, email: string, profile: z.infer<typeof profileSchema>): boolean {
  const clean = name.trim().toLowerCase();
  const display = profile.displayName.trim().toLowerCase();
  const logins = [profile.login, ...profile.extraLogins].map((login) => login.toLowerCase());
  if (clean !== "" && (clean === display || logins.includes(clean))) return true;
  const at = email.indexOf("@");
  const local = at < 0 ? email : email.slice(0, at);
  return logins.some((login) => local.toLowerCase().includes(login));
}

async function discoverFromEvents(
  client: GitHubClient,
  profile: z.infer<typeof profileSchema>,
): Promise<{ email: string; name: string }[]> {
  const found: { email: string; name: string }[] = [];
  for (let page = 1; page <= EVENT_PAGES; page++) {
    const events = await client.github(
      eventsSchema,
      `users/${profile.login}/events/public?per_page=100&page=${page}`,
    );
    if (events.length === 0) break;
    for (const e of events) {
      if (e.type !== "PushEvent") continue;
      const commits = e.payload.commits;
      if (commits === undefined) continue;
      for (const c of commits) {
        if (!found.some((f) => f.email.trim().toLowerCase() === c.author.email.trim().toLowerCase())) {
          found.push({ email: c.author.email, name: c.author.name });
        }
      }
    }
    if (events.length < 100) break;
  }
  return found;
}

async function nameEmails(repo: string, name: string, client: GitHubClient): Promise<string[]> {
  const variants = [name, name.toLowerCase(), name.toUpperCase()].filter(
    (v, i, arr) => v !== "" && arr.indexOf(v) === i,
  );
  const emails: string[] = [];
  for (const variant of variants) {
    await pause();
    const res = await client.github(
      commitSearchSchema,
      `search/commits?q=${encodeURIComponent(`repo:${repo} author-name:"${variant}"`)}&per_page=100`,
    );
    for (const item of res.items) {
      const email = item.commit.author.email.trim().toLowerCase();
      if (email !== "" && !emails.includes(email)) emails.push(email);
    }
  }
  return emails;
}

async function isUnattributed(email: string, client: GitHubClient): Promise<boolean> {
  await pause();
  const res = await client.github(
    commitSearchSchema,
    `search/commits?q=${encodeURIComponent(`author-email:${email}`)}&per_page=1`,
  );
  if (res.total_count === 0) return false;
  const item = res.items[0];
  if (item === undefined) return false;
  return item.author === null;
}

async function repoEmailCount(repo: string, email: string, client: GitHubClient): Promise<number> {
  await pause();
  const res = await client.github(
    commitSearchSchema,
    `search/commits?q=${encodeURIComponent(`repo:${repo} author-email:${email}`)}&per_page=1`,
  );
  return res.total_count;
}

function candidates(
  repos: Record<string, z.infer<typeof repoStatsSchema>>,
): [string, z.infer<typeof repoStatsSchema>][] {
  const out: [string, z.infer<typeof repoStatsSchema>][] = [];
  for (const entry of Object.entries(repos)) {
    const full = need(entry[0], "repo");
    const slot = need(entry[1], `stats for ${full}`);
    if (slot.mine || slot.fork || slot.archived || slot.private) continue;
    if (slot.description === null || slot.description.trim() === "") continue;
    out.push([full, slot]);
  }
  return out;
}

export async function enrichWithEmails(
  repos: Record<string, z.infer<typeof repoStatsSchema>>,
  client: GitHubClient,
  profile: z.infer<typeof profileSchema>,
): Promise<string[]> {
  const found = candidates(repos);
  if (found.length === 0) return [];
  const emails = new Map<string, string>();
  const add = (email: string, name: string): void => {
    const key = email.trim().toLowerCase();
    if (key === "" || emails.has(key)) return;
    if (!looksMine(name, key, profile)) return;
    emails.set(key, key);
  };
  for (const extra of profile.extraEmails) add(extra, profile.displayName);
  try {
    for (const d of await discoverFromEvents(client, profile)) add(d.email, d.name);
  } catch (err) {
    warn("email discovery", errMsg(err));
  }
  for (const entry of found) {
    const full = need(entry[0], "repo");
    try {
      for (const email of await nameEmails(full, profile.displayName, client)) {
        add(email, profile.displayName);
      }
    } catch (err) {
      warn(`name search in ${full}`, errMsg(err));
    }
  }
  const tracked: string[] = [];
  for (const email of emails.values()) {
    try {
      if (await isUnattributed(email, client)) tracked.push(email);
    } catch (err) {
      warn(`email check for ${email}`, errMsg(err));
    }
  }
  for (const entry of found) {
    const full = need(entry[0], "repo");
    const slot = need(entry[1], `stats for ${full}`);
    for (const email of tracked) {
      try {
        slot.commits += await repoEmailCount(full, email, client);
      } catch (err) {
        warn(`email commits for ${full}`, errMsg(err));
      }
    }
  }
  return tracked;
}
