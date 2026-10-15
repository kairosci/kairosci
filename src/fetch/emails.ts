import { z } from "zod";
import { need } from "../defined.ts";
import { commitSearchSchema, eventsSchema, profileSchema, repoStatsSchema } from "../schemas.ts";
import { GitHubClient, describeError, logWarning } from "./client.ts";

const SEARCH_PAUSE = 2000;
const EVENT_PAGES = 5;

export function waitBetweenGitHubRequests(): Promise<void> {
  return new Promise((r) => setTimeout(r, SEARCH_PAUSE));
}

function matchesProfileIdentity(name: string, email: string, profile: z.infer<typeof profileSchema>): boolean {
  const clean = name.trim().toLowerCase();
  const display = profile.displayName.trim().toLowerCase();
  const logins = [profile.login, ...profile.extraLogins].map((login) => login.toLowerCase());
  if (clean !== "" && (clean === display || logins.includes(clean))) return true;
  const at = email.indexOf("@");
  const local = at < 0 ? email : email.slice(0, at);
  return logins.some((login) => local.toLowerCase().includes(login));
}

async function discoverAuthorEmailsFromEvents(
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

async function findCommitEmailsByAuthorName(repo: string, name: string, client: GitHubClient): Promise<string[]> {
  const variants = [name, name.toLowerCase(), name.toUpperCase()].filter(
    (v, i, arr) => v !== "" && arr.indexOf(v) === i,
  );
  const emails: string[] = [];
  for (const variant of variants) {
    await waitBetweenGitHubRequests();
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

async function isUnattributedEmail(email: string, client: GitHubClient): Promise<boolean> {
  await waitBetweenGitHubRequests();
  const res = await client.github(
    commitSearchSchema,
    `search/commits?q=${encodeURIComponent(`author-email:${email}`)}&per_page=1`,
  );
  if (res.total_count === 0) return false;
  const item = res.items[0];
  if (item === undefined) return false;
  return item.author === null;
}

async function countCommitsByAuthorEmail(repo: string, email: string, client: GitHubClient): Promise<number> {
  await waitBetweenGitHubRequests();
  const res = await client.github(
    commitSearchSchema,
    `search/commits?q=${encodeURIComponent(`repo:${repo} author-email:${email}`)}&per_page=1`,
  );
  return res.total_count;
}

function selectRepositoryEmailCandidates(
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

export async function enrichRepositoryStatsWithAuthorEmails(
  repos: Record<string, z.infer<typeof repoStatsSchema>>,
  client: GitHubClient,
  profile: z.infer<typeof profileSchema>,
): Promise<string[]> {
  const found = selectRepositoryEmailCandidates(repos);
  if (found.length === 0) return [];
  const emails = new Map<string, string>();
  const add = (email: string, name: string): void => {
    const key = email.trim().toLowerCase();
    if (key === "" || emails.has(key)) return;
    if (!matchesProfileIdentity(name, key, profile)) return;
    emails.set(key, key);
  };
  for (const extra of profile.extraEmails) add(extra, profile.displayName);
  try {
    for (const d of await discoverAuthorEmailsFromEvents(client, profile)) add(d.email, d.name);
  } catch (err) {
    logWarning("email discovery", describeError(err));
  }
  for (const entry of found) {
    const full = need(entry[0], "repo");
    try {
      for (const email of await findCommitEmailsByAuthorName(full, profile.displayName, client)) {
        add(email, profile.displayName);
      }
    } catch (err) {
      logWarning(`name search in ${full}`, describeError(err));
    }
  }
  const tracked: string[] = [];
  for (const email of emails.values()) {
    try {
      if (await isUnattributedEmail(email, client)) tracked.push(email);
    } catch (err) {
      logWarning(`email check for ${email}`, describeError(err));
    }
  }
  for (const entry of found) {
    const full = need(entry[0], "repo");
    const slot = need(entry[1], `stats for ${full}`);
    for (const email of tracked) {
      try {
        slot.commits += await countCommitsByAuthorEmail(full, email, client);
      } catch (err) {
        logWarning(`email commits for ${full}`, describeError(err));
      }
    }
  }
  return tracked;
}
