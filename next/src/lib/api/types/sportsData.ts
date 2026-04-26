import type { ISODateTimeString, UUID } from "../response";

export type SportsEvent = {
  id: UUID;
  provider: string;
  provider_event_id: string;
  sport: string;
  competition_name?: string | null;
  status: string;
  start_time_utc?: ISODateTimeString | null;
  participants?: unknown;
  result?: unknown;
  inserted_at?: ISODateTimeString;
  updated_at?: ISODateTimeString;
  [k: string]: unknown;
};

export type SportsDataSyncLog = {
  id: UUID;
  provider: string;
  source: string;
  status: string;
  fetched_count?: number;
  upserted_count?: number;
  failed_count?: number;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
  inserted_at?: ISODateTimeString;
  [k: string]: unknown;
};

export type SportsDataRejection = {
  id: UUID;
  provider: string;
  provider_event_id: string;
  source: string;
  reason: string;
  diagnostics?: Record<string, unknown> | null;
  replay_status?: string | null;
  replayed_at?: ISODateTimeString | null;
  inserted_at?: ISODateTimeString;
  [k: string]: unknown;
};
