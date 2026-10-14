import { z } from "zod";

export const linkSchema = z.object({
  label: z.string().min(1),
  handle: z.string(),
  url: z.string().min(1),
  icon: z.enum(["website", "github"]),
});

export const tuningSchema = z.object({
  newDays: z.number().int().positive(),
  trendWindows: z.array(z.number().int().positive()).min(1),
  maxTrendRows: z.number().int().positive(),
  minTrendGainers: z.number().int().nonnegative(),
  minTrendGain: z.number().int().nonnegative(),
  topLanguages: z.number().int().positive(),
  headerTools: z.number().int().positive(),
  kvKeyWidth: z.number().int().positive(),
  minCommits: z.number().int().nonnegative(),
  minStars: z.number().int().nonnegative(),
});

export const profileSchema = z.object({
  login: z.string().min(1),
  displayName: z.string().min(1),
  headerName: z.string().min(1),
  siteUrl: z.string().min(1),
  siteHost: z.string().min(1),
  githubUrl: z.string().min(1),
  profileRepo: z.string().min(1),
  userAgent: z.string().min(1),
  maxProjects: z.number().int().positive(),
  maxCards: z.number().int().positive(),
  tz: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  memberSince: z.string().min(1),
  extraLogins: z.array(z.string().min(1)),
  tuning: tuningSchema,
  links: z.array(linkSchema).min(1),
});

export const citySchema = z.object({
  roofs: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  left: z.string(),
  right: z.string(),
  empty: z.string(),
  emptyStroke: z.string(),
  winOn: z.string(),
  winSide: z.string(),
  winOff: z.string(),
  sky: z.string(),
});

export const themeSchema = z.object({
  name: z.string().min(1),
  accent: z.string(),
  accent2: z.string(),
  ok: z.string(),
  bg: z.string(),
  fg: z.string(),
  dim: z.string(),
  faint: z.string(),
  fainter: z.string(),
  bright: z.string(),
  star: z.string(),
  langs: z.array(z.string()).min(1),
  series: z.array(z.string()).min(2),
  well: z.string(),
  moon: z.string(),
  city: citySchema,
});

export const themesFileSchema = z.object({
  themes: z.array(themeSchema).min(1),
});

export const projectSchema = z.object({
  name: z.string().min(1),
  repo: z.string().min(1),
  kind: z.string(),
  description: z.string(),
  tagline: z.string(),
  install: z.string(),
  stars: z.string(),
  href: z.string().min(1),
  logo: z.string(),
});

export const postSchema = z.object({
  title: z.string(),
  url: z.string(),
  date: z.string(),
  description: z.string(),
  reading_time: z.number(),
});

export const countSchema = z.object({
  count: z.number().int().nonnegative(),
  query: z.string(),
});

export const countMapSchema = z.record(z.string(), z.number());

export const gitHubStatsSchema = z.object({
  created_at: z.string(),
  followers: z.number().int().nonnegative(),
  public_repos: z.number().int().nonnegative(),
  prs: z.number().int().nonnegative(),
  prs_merged: z.number().int().nonnegative(),
  year: z.number().int(),
  contributions_year: z.number().int().nonnegative(),
  contributions_all: z.number().int().nonnegative(),
  streak_current: z.number().int().nonnegative(),
  streak_longest: z.number().int().nonnegative(),
  languages: countMapSchema,
});

export const snapshotSchema = z.object({
  intro: z.string(),
  projects: z.array(projectSchema),
  posts: z.array(postSchema),
  upstreamRepos: z.number().int().nonnegative(),
  stars: z.number().int().nonnegative().nullable(),
  issues: countSchema.nullable(),
  prs: countSchema.nullable(),
  github: gitHubStatsSchema.nullable(),
});

export const calendarSchema = z.array(z.tuple([z.string(), z.number().int().nonnegative()]));

export const repoStarsSchema = z.object({
  created_at: z.string(),
  total: z.number().int().nonnegative(),
  daily: countMapSchema,
});

export const starsSchema = z.object({
  end: z.string(),
  repos: z.record(z.string(), repoStarsSchema),
});

export const buttonSchema = z.object({
  label: z.string().min(1),
  handle: z.string(),
  url: z.string().min(1),
  icon: z.string(),
});

export const trendSchema = z.object({
  p: projectSchema,
  color: z.string(),
  gain: z.number().int().nonnegative(),
  gain7: z.number().int().nonnegative(),
  prior: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  isNew: z.boolean(),
  ratio: z.number().nullable(),
  daily: z.array(z.number().int().nonnegative()),
});

export const phaseSchema = z.enum(["night", "dawn", "day", "dusk"]);

export const skySchema = z.object({
  phase: phaseSchema,
  event: z.enum(["sunrise", "sunset"]),
  at: z.string().min(1),
});

export const userBioSchema = z.object({
  bio: z.string().nullable(),
});

export const gqlProfileSchema = z.object({
  user: z.object({
    createdAt: z.string(),
    followers: z.object({ totalCount: z.number().int().nonnegative() }),
    repositories: z.object({ totalCount: z.number().int().nonnegative() }),
    pullRequests: z.object({ totalCount: z.number().int().nonnegative() }),
    merged: z.object({ totalCount: z.number().int().nonnegative() }),
    contributionsCollection: z.object({ contributionYears: z.array(z.number().int()) }),
  }),
});

export const repoStatsSchema = z.object({
  commits: z.number().int().nonnegative(),
  prs: z.number().int().nonnegative(),
  description: z.string().nullable(),
  stars: z.number().int().nonnegative(),
  url: z.string().min(1),
  lang: z.string().nullable(),
  fork: z.boolean(),
  archived: z.boolean(),
  private: z.boolean(),
  mine: z.boolean(),
});

export const contribEntrySchema = z.object({  contributions: z.object({ totalCount: z.number().int().nonnegative() }),
  repository: z.object({
    nameWithOwner: z.string().min(1),
    description: z.string().nullable(),
    stargazerCount: z.number().int().nonnegative(),
    url: z.string().min(1),
    primaryLanguage: z.object({ name: z.string() }).nullable(),
    isFork: z.boolean(),
    isArchived: z.boolean(),
    isPrivate: z.boolean(),
  }),
});

export const yearDataSchema = z.object({
  contributionCalendar: z.object({
    totalContributions: z.number().int().nonnegative(),
    weeks: z.array(
      z.object({
        contributionDays: z.array(
          z.object({
            date: z.string(),
            contributionCount: z.number().int().nonnegative(),
          }),
        ),
      }),
    ),
  }),
  commitContributionsByRepository: z.array(contribEntrySchema),
  pullRequestContributionsByRepository: z.array(contribEntrySchema),
});

export const gqlYearsSchema = z.object({
  user: z.record(z.string(), yearDataSchema),
});

export const searchResponseSchema = z.object({
  total_count: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      title: z.string(),
      user: z.object({ login: z.string(), type: z.string() }),
    }),
  ),
});

export const searchCountSchema = z.object({
  total_count: z.number().int().nonnegative(),
});

export const stargazerListSchema = z.array(z.object({ starred_at: z.string() }));

export const repoMetaSchema = z.object({
  created_at: z.string(),
  stargazers_count: z.number().int().nonnegative(),
});

export const gqlEnvelopeSchema = z.object({
  data: z.unknown(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

export const geoSchema = z.object({
  narrow: z.boolean(),
  W: z.number(),
  M: z.number(),
  FL: z.number(),
  FR: z.number(),
  X: z.number(),
  R: z.number(),
  HW: z.number(),
});

export const docSchema = z.object({
  w: z.number(),
  h: z.number(),
  title: z.string(),
  desc: z.string(),
  text: z.string(),
  body: z.string(),
  css: z.string().optional(),
  defs: z.string().optional(),
  weights: z.array(z.number()).optional(),
});

export const sliceOptsSchema = docSchema
  .omit({ w: true, h: true, body: true })
  .extend({
    top: z.boolean().optional(),
    bottom: z.boolean().optional(),
  });

export const skyBoxSchema = z.object({
  x0: z.number(),
  x1: z.number(),
  top: z.number(),
  horizon: z.number(),
  bottom: z.number(),
  fade: z.object({
    x: z.number(),
    left: z.array(z.number()),
    right: z.array(z.number()),
  }),
  high: z.tuple([z.number(), z.number()]),
  low: z.tuple([z.number(), z.number()]),
  k: z.number(),
  clouds: z.array(z.tuple([z.number(), z.number(), z.number()])),
  drift: z.number(),
});

export const tileDataSchema = z.object({
  label: z.string(),
  value: z.string(),
  sub: z.string(),
});

export const kvDataSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const langShareSchema = z.object({
  name: z.string(),
  share: z.number(),
});
