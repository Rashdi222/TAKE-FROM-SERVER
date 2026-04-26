export type SportHub = {
  slug: string;
  title: string;
  description: string;
  summary: string;
  keywords: string[];
  markets: string[];
};

export const SPORT_HUBS: SportHub[] = [
  {
    slug: "cricket",
    title: "Cricket Betting",
    description:
      "Explore public cricket fixtures, published odds, and match coverage across league and tournament schedules on Sixerbat.",
    summary:
      "Cricket on Sixerbat focuses on scheduled fixtures, live score states, and published betting markets built on the platform workflow.",
    keywords: ["cricket betting", "cricket fixtures", "live cricket odds"],
    markets: ["Match Winner", "Over/Under", "In-Play"],
  },
  {
    slug: "football",
    title: "Football Betting",
    description:
      "Track football fixtures, match previews, and published betting markets including match winner, over/under, double chance, and BTTS.",
    summary:
      "Football coverage includes public fixtures, live status, and published platform odds across pre-match and supported in-play workflows.",
    keywords: ["football betting", "football fixtures", "BTTS betting"],
    markets: ["Match Winner", "Over/Under", "Double Chance", "BTTS", "In-Play"],
  },
  {
    slug: "tennis",
    title: "Tennis Betting",
    description:
      "View tennis fixtures, published odds, and supported markets including match winner, over/under, set betting, and live states.",
    summary:
      "Tennis pages help users find active fixtures and understand the supported set-based and match-level betting coverage.",
    keywords: ["tennis betting", "tennis fixtures", "set betting"],
    markets: ["Match Winner", "Over/Under", "Set Betting", "In-Play"],
  },
  {
    slug: "horse-racing",
    title: "Horse Racing Betting",
    description:
      "Browse horse racing schedules, published runner markets, and race coverage for win and place betting on Sixerbat.",
    summary:
      "Horse racing coverage is built around imported race data, runner-aware odds generation, and published platform markets.",
    keywords: ["horse racing betting", "horse racing fixtures", "place betting"],
    markets: ["Match Winner", "Place"],
  },
  {
    slug: "dog-racing",
    title: "Dog Racing Betting",
    description:
      "Discover dog racing fixtures, live race status, and published platform odds for active greyhound events on Sixerbat.",
    summary:
      "Dog racing pages provide public visibility into imported race schedules and active published platform odds where available.",
    keywords: ["dog racing betting", "greyhound betting", "dog racing fixtures"],
    markets: ["Match Winner"],
  },
];

export const FAQ_ITEMS = [
  {
    question: "How does Sixerbat publish odds to players?",
    answer:
      "Matches are imported into the platform first, then platform odds are generated or curated by administrators and published only after review.",
  },
  {
    question: "Are all internal dashboards indexable by search engines?",
    answer:
      "No. Admin, master-admin, player account, wallet, and auth flows are intentionally marked non-indexable.",
  },
  {
    question: "Which public pages are indexable right now?",
    answer:
      "The public landing page, matches list, match detail pages, sport hub pages, and public informational support pages are indexable.",
  },
  {
    question: "Does Sixerbat support live match coverage?",
    answer:
      "Yes. Public match pages surface live status where available, while backend feed controls handle upcoming and live sync operations.",
  },
];

export function getSportHub(slug: string) {
  return SPORT_HUBS.find((sport) => sport.slug === slug) ?? null;
}

