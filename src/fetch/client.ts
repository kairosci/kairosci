import { z } from "zod";
import { profileSchema, gqlEnvelopeSchema } from "../schemas.ts";

const token = process.env["GITHUB_TOKEN"];

export function warn(title: string, message: string): void {
  const actions = process.env["GITHUB_ACTIONS"];
  if (actions === undefined) console.warn(`warn: ${title}: ${message}`);
  else console.warn(`::warning title=${title}::${message}`);
}

export function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function get(url: string, headers: Record<string, string>): Promise<Response> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

export async function github<S extends z.ZodType>(
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

const profileTokenEnv = process.env["PROFILE_TOKEN"];
let graphqlToken = profileTokenEnv === undefined ? token : profileTokenEnv;

export async function graphql<S extends z.ZodType>(
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
