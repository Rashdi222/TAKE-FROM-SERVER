import type { ISODateTimeString, UUID } from "../response";

export type BetStatus = "pending" | "active" | "won" | "lost" | "cancelled" | "rejected";

export type Bet = {
  id: UUID;
  user_id?: UUID;
  match_id: UUID;
  odds_id?: UUID;
  stake: number;
  potential_win?: number | null;
  status: BetStatus | string;
  is_in_play?: boolean;
  result?: string | null;
  settled_at?: ISODateTimeString | null;
  inserted_at?: ISODateTimeString;
  [k: string]: unknown;
};

export type CreateBetRequest = Record<string, unknown>;
