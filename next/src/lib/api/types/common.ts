import type { ISODateTimeString, UUID } from "../response";

export type PaginationMeta = {
  page?: number;
  page_size?: number;
  total_count?: number;
  total_pages?: number;
};

export type Meta = {
  timestamp?: ISODateTimeString;
  pagination?: PaginationMeta;
  [k: string]: unknown;
};

export type UserRef = { id: UUID; email?: string; username?: string | null };

