import assert from "node:assert/strict";
import { test } from "node:test";
import { loadProfile, loadTheme } from "../src/profile.ts";
import { GitHubClient } from "../src/fetch/client.ts";
import { isAutomatedGitHubAccount, collectRepositoryStarHistories } from "../src/fetch/counts.ts";
import { isProfileOwnedRepository, resolveExtraRepos } from "../src/fetch/user.ts";
import { profileSchema, repoStatsSchema } from "../src/schemas.ts";

const profile = await loadProfile();
const metadata = {
  full_name: "RustPython/RustPython", description: "Python in Rust", stargazers_count: 100,
  html_url: "https://github.com/RustPython/RustPython", language: "Rust", fork: false,
  archived: false, private: false,
};

class StubClient extends GitHubClient {
  paths: string[] = [];
  constructor() { super("test", undefined, undefined); }
  override async get(url: string): Promise<Response> {
    const path = new URL(url).pathname;
    this.paths.push(url);
    if (path === "/search/repositories") return Response.json({ total_count: 2, items: [
      { ...metadata, full_name: "Other/RustPython-tools", stargazers_count: 1000 }, metadata,
    ] });
    if (path === "/search/issues") return Response.json({ total_count: 0, items: [] });
    if (path === "/repos/RUSTPYTHON/RUSTPYTHON") return Response.json(metadata);
    return Response.json({ created_at: "2020-01-01T00:00:00Z", stargazers_count: 105 });
  }
}

test("identity checks and theme lookup ignore casing", async () => {
  assert.equal(isProfileOwnedRepository(`${profile.login.toUpperCase()}/repo`, profile), true);
  assert.equal(isProfileOwnedRepository(`other/${profile.login}`, profile), false);
  assert.equal(isAutomatedGitHubAccount("Tool[BOT]", "user"), true);
  assert.equal(isAutomatedGitHubAccount("tool", "BOT"), true);
  assert.equal((await loadTheme("REEF")).name, "reef");
  assert.deepEqual(profileSchema.parse({ ...profile, extraRepos: undefined }).extraRepos, []);
  assert.equal(profileSchema.safeParse({ ...profile, extraRepos: ["owner/repo/invalid"] }).success, false);
});

test("extra repositories resolve exact names and do not overwrite existing stats", async () => {
  const client = new StubClient();
  const repos: Record<string, ReturnType<typeof repoStatsSchema.parse>> = {};
  await resolveExtraRepos(repos, client, { ...profile, extraLogins: [], extraRepos: ["rustpython", "RUSTPYTHON/RUSTPYTHON"] });
  assert.deepEqual(Object.keys(repos), [metadata.full_name]);
  assert.equal(repos[metadata.full_name]?.stars, 100);
  assert.equal(client.paths.filter((url) => url.includes("search/issues")).length, 1);
  const existing = repoStatsSchema.parse({ ...repos[metadata.full_name], commits: 42 });
  const cached = { "rustpython/rustpython": existing };
  await resolveExtraRepos(cached, client, { ...profile, extraRepos: ["RUSTPYTHON/RUSTPYTHON"] });
  assert.equal(Object.keys(cached).length, 1);
  assert.equal(existing.commits, 42);
});

test("star history survives a repository casing change", async () => {
  const project = JSON.parse(await (await import("node:fs/promises")).readFile("data/snapshot.json", "utf8")).projects[0];
  const history = await collectRepositoryStarHistories([{ ...project, repo: "Owner/Repo" }], "2026-10-14", {
    end: "2026-10-13", repos: { "owner/repo": { created_at: "2020-01-01", total: 100, daily: { "2026-10-13": 100 } } },
  }, new StubClient());
  assert.deepEqual(history.repos["Owner/Repo"]?.daily, { "2026-10-13": 100, "2026-10-14": 5 });
});
