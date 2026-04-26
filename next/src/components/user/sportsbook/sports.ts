import {
  CircleDot,
  Flag,
  Orbit,
  PawPrint,
  Trophy,
  type LucideIcon,
} from "lucide-react";

export type SportsbookSportId =
  | "cricket"
  | "football"
  | "tennis"
  | "horse_racing"
  | "dog_racing";

export type SportsbookSportItem = {
  id: SportsbookSportId;
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  accentClass: string;
  image: string;
};

export const SPORTBOOK_SPORTS: SportsbookSportItem[] = [
  {
    id: "cricket",
    href: "/sportsbook/cricket",
    label: "Cricket",
    shortLabel: "Cricket",
    description: "Ball-by-ball live boards and session swings.",
    icon: Trophy,
    iconColor: "text-cyan-300",
    accentClass: "from-cyan-500/18 via-cyan-400/10 to-transparent",
    image: "/images/image_3.png",
  },
  {
    id: "football",
    href: "/sportsbook/football",
    label: "Football",
    shortLabel: "Football",
    description: "Live minutes, corners, shots and match odds.",
    icon: CircleDot,
    iconColor: "text-lime-300",
    accentClass: "from-lime-500/18 via-lime-400/10 to-transparent",
    image: "/images/image_4.png",
  },
  {
    id: "tennis",
    href: "/sportsbook/tennis",
    label: "Tennis",
    shortLabel: "Tennis",
    description: "Set pressure and point-by-point momentum.",
    icon: Orbit,
    iconColor: "text-orange-300",
    accentClass: "from-orange-500/18 via-orange-400/10 to-transparent",
    image: "/images/image_6.png",
  },
  {
    id: "horse_racing",
    href: "/sportsbook/horse_racing",
    label: "Horse Racing",
    shortLabel: "Horses",
    description: "Race cards, starts and late market moves.",
    icon: Flag,
    iconColor: "text-rose-300",
    accentClass: "from-rose-500/18 via-rose-400/10 to-transparent",
    image: "/images/image_7.png",
  },
  {
    id: "dog_racing",
    href: "/sportsbook/dog_racing",
    label: "Dog Racing",
    shortLabel: "Dogs",
    description: "Fast race cards and short-cycle boards.",
    icon: PawPrint,
    iconColor: "text-violet-300",
    accentClass: "from-violet-500/18 via-violet-400/10 to-transparent",
    image: "/images/image_5.png",
  },
];

export const SPORTBOOK_SPORT_LABELS = SPORTBOOK_SPORTS.reduce<Record<string, string>>((acc, item) => {
  acc[item.id] = item.label;
  return acc;
}, {});

export function getSportsbookSport(slug: string) {
  return SPORTBOOK_SPORTS.find((item) => item.id === slug);
}
