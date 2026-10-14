import { z } from "zod";
import { need } from "../defined.ts";
import { commitSearchSchema, eventsSchema, profileSchema, repoStatsSchema } from "../schemas.ts";
import { errMsg, github, warn } from "./client.ts";

const SEARCH_PAUSE = 2000;
const EVENT_PAGES = 5;

function pause(): Promise<void> {
  return new Promise((r) => setTimeout(r, SEARCH_PAUSE));
}

function looksMine(name: string, email: string, profile: z.infer<typeof profileSchema>): boolean {
  const clean = name.trim().toLowerCase();
  const display = profile.displayName.trim().toLowerCase();
  const login = profile.login.toLowerCase();
  if (clean !== "" && (clean === display || clean === login)) return true;
  const at = email.indexOf("@");
  const local = at < 0 ? email : email.slice(0, at);
  return local.includes(login);
}

async function discoverFromEvents(
  profile: z.infer<typeof profileSchema>,
): Promise<{ email: string; name: string }[]> {
  const found: { email: string; name: string }[] = [];
  for (let page = 1; page <= EVENT_PAGES; page++) {
    const events = await github(
      eventsSchema,
      `users/${profile.login}/events/public?per_page=100&page=${page}`,
      profile.userAgent,
    );
    if (events.length === 0) break;
    for (const e of events) {
      if (e.type !== "PushEvent") continue;
      const commits = e.payload.commits;
      if (commits === undefined) continue;
      for (const c of commits) {
        if (!found.some((f) => f.email === c.author.email)) {
          found.push({ email: c.author.email, name: c.author.name });
        }
      }
    }
    if (events.length < 100) break;
  }
  return found;
}

async function nameEmails(
  repo: string,
  name: string,
  profile: z.infer<typeof profileSchema>,
): Promise<string[]> {
  await pause();
  const res = await github(
    commitSearchSchema,
    `search/commits?q=${encodeURIComponent(`repo:${repo} author-name:"${name}"`)}&per_page=100`,
    profile.userAgent,
  );
  const emails: string[] = [];
  for (const item of res.items) {
    const email = item.commit.author.email.trim().toLowerCase();
    if (email !== "" && !emails.includes(email)) emails.push(email);
  }
  return emails;
}

async function isUnattributed(email: string, profile: z.infer<typeof profileSchema>): Promise<boolean> {
  await pause();
  const res = await github(
    commitSearchSchema,
    `search/commits?q=${encodeURIComponent(`author-email:${email}`)}&per_page=1`,
    profile.userAgent,
  );
  if (res.total_count === 0) return false;
  const item = res.items[0];
  if (item === undefined) return false;
  return item.author === null;
}

async function repoEmailCount(
  repo: string,
  email: string,
  profile: z.infer<typeof profileSchema>,
): Promise<number> {
  await pause();
  const res = await github(
    commitSearchSchema,
    `search/commits?q=${encodeURIComponent(`repo:${repo} author-email:${email}`)}&per_page=1`,
    profile.userAgent,
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
  profile: z.infer<typeof profileSchema>,
): Promise<string[]> {
  const found = candidates(repos);
  if (found.length === 0) return [];
  const emails = new Map<string, string>();
  const add = (email: string, name: string): void => {
    const key = email.trim().toLowerCase();
    if (key === "" || emails.has(key)) return;
    if (!looksMine(name, key, profile)) return;
    emails.set(key, email.trim());
  };
  for (const extra of profile.extraEmails) add(extra, profile.displayName);
  try {
    for (const d of await discoverFromEvents(profile)) add(d.email, d.name);
  } catch (err) {
    warn("email discovery", errMsg(err));
  }
  for (const entry of found) {
    const full = need(entry[0], "repo");
    try {
      for (const email of await nameEmails(full, profile.displayName, profile)) {
        add(email, profile.displayName);
      }
    } catch (err) {
      warn(`name search in ${full}`, errMsg(err));
    }
  }
  const tracked: string[] = [];
  for (const email of emails.values()) {
    try {
      if (await isUnattributed(email, profile)) tracked.push(email);
    } catch (err) {
      warn(`email check for ${email}`, errMsg(err));
    }
  }
  for (const entry of found) {
    const full = need(entry[0], "repo");
    const slot = need(entry[1], `stats for ${full}`);
    for (const email of tracked) {
      try {
        slot.commits += await repoEmailCount(full, email, profile);
      } catch (err) {
        warn(`email commits for ${full}`, errMsg(err));
      }
    }
  }
  return tracked;
}
