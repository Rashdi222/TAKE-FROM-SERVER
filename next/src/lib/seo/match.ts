import type { Match } from "@/lib/api";
import { absoluteUrl } from "@/lib/seo/site";

export function getMatchDisplayName(match: Match) {
  return [match.team1, match.team2].filter(Boolean).join(" vs ") || "Match";
}

export function getMatchPath(match: Match) {
  const slug = match.slug || slugifyMatchFallback(match);
  return `/matches/${match.id}/${slug}`;
}

export function getMatchTitle(match: Match) {
  return `${getMatchDisplayName(match)} Odds, Match Preview & Betting`;
}

export function getMatchDescription(match: Match) {
  const sport = String(match.sport || "sports").replace(/_/g, " ");
  const status = String(match.status || "scheduled");
  const startTime = match.start_time
    ? new Date(match.start_time).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "TBA";

  return `View ${sport} betting markets, live status, and published platform odds for ${getMatchDisplayName(
    match,
  )} on Sixerbat. Scheduled start: ${startTime}. Current status: ${status}.`;
}

export function buildSportsEventJsonLd(match: Match) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: getMatchDisplayName(match),
    sport: String(match.sport || "").replace(/_/g, " "),
    startDate: match.start_time || undefined,
    eventStatus: mapEventStatus(match.status),
    homeTeam: match.team1
      ? {
          "@type": "SportsTeam",
          name: match.team1,
        }
      : undefined,
    awayTeam: match.team2
      ? {
          "@type": "SportsTeam",
          name: match.team2,
        }
      : undefined,
    url: absoluteUrl(getMatchPath(match)),
  };
}

export function buildMatchBreadcrumbJsonLd(match: Match) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: absoluteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Matches",
        item: absoluteUrl("/matches"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: getMatchDisplayName(match),
        item: absoluteUrl(getMatchPath(match)),
      },
    ],
  };
}

function slugifyMatchFallback(match: Match) {
  const base = [match.sport, match.team1, "vs", match.team2, match.start_time]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function mapEventStatus(status?: string) {
  switch (status) {
    case "live":
      return "https://schema.org/EventScheduled";
    case "settled":
    case "closed":
    case "finished":
      return "https://schema.org/EventCompleted";
    case "cancelled":
      return "https://schema.org/EventCancelled";
    case "scheduled":
    default:
      return "https://schema.org/EventScheduled";
  }
}
