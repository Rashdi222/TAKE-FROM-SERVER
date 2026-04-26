export type ApiFieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  status: number;
  fieldErrors?: ApiFieldErrors;
  raw?: unknown;

  constructor(message: string, opts: { status: number; fieldErrors?: ApiFieldErrors; raw?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.fieldErrors = opts.fieldErrors;
    this.raw = opts.raw;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

