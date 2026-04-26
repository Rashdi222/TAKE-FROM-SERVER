import type { TennisMatchState } from "@/lib/api";
import type { TennisContext } from "@/lib/tennis/tennisContext";

export type TennisRecentPoint = {
  id: string;
  label: string;
  wonBy?: "player_1" | "player_2" | null;
  breakPoint?: boolean;
  setPoint?: boolean;
  matchPoint?: boolean;
};

export type TennisLiveStat = {
  label: string;
  value: string;
};

export function resolveServerSide(server?: string | null): "player_1" | "player_2" | "unknown" {
  const normalized = String(server || "").toLowerCase();
  if (normalized === "player_1" || normalized === "1") return "player_1";
  if (normalized === "player_2" || normalized === "2") return "player_2";
  return "unknown";
}

export function extractRecentPoints(match: TennisMatchState): TennisRecentPoint[] {
  const groups = Array.isArray(match.point_by_point) ? match.point_by_point : [];
  const currentGame = groups.at(-1);
  const rawPoints = Array.isArray(currentGame?.points) ? currentGame.points : [];

  return rawPoints.slice(-8).map((point, index) => {
    const score = asRecord(point);
    const label = String(score?.score || score?.result || score?.label || "•");
    const normalized = label.toLowerCase();

    return {
      id: `${currentGame?.game ?? "g"}-${index}-${label}`,
      label: normalized === "0" ? "•" : label,
      wonBy: inferPointWinner(normalized),
      breakPoint: Boolean(score?.break_point),
      setPoint: Boolean(score?.set_point),
      matchPoint: Boolean(score?.match_point),
    };
  });
}

export function extractLiveStats(context: TennisContext | null): TennisLiveStat[] {
  const stats = asRecord((context as Record<string, unknown> | null)?.["live_stats"]);
  if (!stats) return [];

  const candidates: Array<[string, unknown]> = [
    ["Aces", stats.aces],
    ["Double Faults", stats.double_faults],
    ["1st Serve %", stats.first_serve_pct],
  ];

  return candidates
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .map(([label, value]) => ({
      label,
      value: String(value),
    }));
}

export function currentGameBlocks(match: TennisMatchState) {
  const score = asRecord(match.score);
  const currentGame = asRecord(score?.current_game);

  return {
    player1: String(currentGame?.player_1 || match.current_game_score?.split("-")[0]?.trim() || "-"),
    player2: String(currentGame?.player_2 || match.current_game_score?.split("-")[1]?.trim() || "-"),
    mode: String(score?.mode || "standard"),
  };
}

function inferPointWinner(normalizedLabel: string): "player_1" | "player_2" | null {
  if (normalizedLabel.includes("1")) return "player_1";
  if (normalizedLabel.includes("2")) return "player_2";
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
