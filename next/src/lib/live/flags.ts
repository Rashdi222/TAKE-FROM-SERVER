import type { Match } from "@/lib/api";

export const ENABLE_CANONICAL_LIVE_TRADING =
  process.env.NEXT_PUBLIC_ENABLE_CANONICAL_LIVE_TRADING === "true";

export function shouldUseCanonicalLiveTrading(match: Pick<Match, "status" | "sport"> | null | undefined) {
  return (
    ENABLE_CANONICAL_LIVE_TRADING &&
    match?.status === "live" &&
    match?.sport === "cricket"
  );
}
