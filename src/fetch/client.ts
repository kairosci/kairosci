import { z } from "zod";
import { gqlEnvelopeSchema, stargazerListSchema } from "../schemas.ts";

export function warn(title: string, message: string): void {
  const actions = process.env["GITHUB_ACTIONS"];
  if (actions === undefined) console.warn(`warn: ${title}: ${message}`);
  else console.warn(`::warning title=${title}::${message}`);
}

export function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export class GitHubClient {
  private graphqlToken: string | undefined;
  private agent: string;
  private githubToken: string | undefined;
  private profileToken: string | undefined;

  constructor(agent: string, githubToken: string | undefined, profileToken: string | undefined) {
    this.agent = agent;
    this.githubToken = githubToken;
    this.profileToken = profileToken;
    this.graphqlToken = profileToken === undefined ? githubToken : profileToken;
  }

  async get(url: string, headers: Record<string, string>): Promise<Response> {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res;
  }

  async github<S extends z.ZodType>(schema: S, path: string): Promise<z.infer<S>> {
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "user-agent": this.agent,
      "x-github-api-version": "2022-11-28",
    };
    if (this.githubToken !== undefined) headers["authorization"] = `Bearer ${this.githubToken}`;
    const res = await this.get(`https://api.github.com/${path}`, headers);
    return schema.parse(await res.json());
  }

  async graphql<S extends z.ZodType>(
    schema: S,
    query: string,
    variables: Record<string, string>,
    attempt = 1,
  ): Promise<z.infer<S>> {
    if (this.graphqlToken === undefined) throw new Error("GraphQL needs GITHUB_TOKEN or PROFILE_TOKEN");
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        authorization: `bearer ${this.graphqlToken}`,
        "content-type": "application/json",
        "user-agent": this.agent,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(60_000),
    });
    if ((res.status === 401 || res.status === 403) && this.graphqlToken !== this.githubToken && this.githubToken !== undefined) {
      warn("PROFILE_TOKEN", `GraphQL returned HTTP ${res.status}; using GITHUB_TOKEN (public contributions only)`);
      this.graphqlToken = this.githubToken;
      return this.graphql(schema, query, variables);
    }
    if (res.status >= 500 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 3000 * attempt));
      return this.graphql(schema, query, variables, attempt + 1);
    }
    if (!res.ok) throw new Error(`GraphQL: HTTP ${res.status}`);
    const envelope = gqlEnvelopeSchema.parse(await res.json());
    if (envelope.errors !== undefined && envelope.errors.length > 0) {
      throw new Error(`GraphQL: ${envelope.errors.map((e) => e.message).join("; ")}`);
    }
    return schema.parse(envelope.data);
  }

  async stargazerDays(repo: string): Promise<Record<string, number>> {
    if (this.profileToken === undefined) throw new Error("stargazers need PROFILE_TOKEN");
    const daily: Record<string, number> = {};
    for (let page = 1; page <= 400; page++) {
      const res = await this.get(`https://api.github.com/repos/${repo}/stargazers?per_page=100&page=${page}`, {
        accept: "application/vnd.github.star+json",
        authorization: `Bearer ${this.profileToken}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": this.agent,
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
}
