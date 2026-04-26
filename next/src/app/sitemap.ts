import type { MetadataRoute } from "next";
import { absoluteUrl, getApiBaseUrl } from "@/lib/seo/site";

type PublicMatch = {
  id: string;
  slug?: string;
  updated_at?: string;
};

type PublicTournament = {
  id: string;
  slug: string;
  updated_at?: string;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/matches"),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/sports"),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: absoluteUrl("/sports/cricket"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/sports/football"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/sports/tennis"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/sports/horse-racing"),
      changeFrequency: "weekly",
      priority: 0.75,
    },
    {
      url: absoluteUrl("/sports/dog-racing"),
      changeFrequency: "weekly",
      priority: 0.75,
    },
    {
      url: absoluteUrl("/how-it-works"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/responsible-gaming"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/faq"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/terms"),
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: absoluteUrl("/privacy"),
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: absoluteUrl("/contact"),
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];

  try {
    const [matchResponse, tournamentResponse] = await Promise.all([
      fetch(`${getApiBaseUrl()}/api/matches`, {
        next: { revalidate: 1800 },
      }),
      fetch(`${getApiBaseUrl()}/api/tournaments`, {
        next: { revalidate: 3600 },
      }),
    ]);

    const matches =
      matchResponse.ok
        ? (((await matchResponse.json()) as { data?: PublicMatch[] }).data ?? [])
        : [];

    const tournaments =
      tournamentResponse.ok
        ? (((await tournamentResponse.json()) as { data?: PublicTournament[] }).data ?? [])
        : [];

    return [
      ...staticRoutes,
      ...tournaments.map((tournament) => ({
        url: absoluteUrl(`/tournaments/${tournament.id}/${tournament.slug}`),
        lastModified: tournament.updated_at
          ? new Date(tournament.updated_at)
          : undefined,
        changeFrequency: "daily" as const,
        priority: 0.75,
      })),
      ...matches.map((match) => ({
        url: absoluteUrl(`/matches/${match.id}/${match.slug || match.id}`),
        lastModified: match.updated_at ? new Date(match.updated_at) : undefined,
        changeFrequency: "hourly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    return staticRoutes;
  }
}
