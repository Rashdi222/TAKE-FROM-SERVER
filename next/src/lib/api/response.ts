export type UUID = string;
export type ISODateTimeString = string;

export type DataResponse<T> = { data: T; meta?: unknown };
export type ListResponse<T> = { data: T[]; meta?: unknown };

export type ErrorResponse =
  | { error: string; [k: string]: unknown }
  | { errors: Record<string, string[]>; [k: string]: unknown };

