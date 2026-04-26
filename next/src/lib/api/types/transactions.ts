import type { ISODateTimeString, UUID } from "../response";

export type AccountTransaction = {
  id: UUID;
  amount: number;
  transaction_type: string;
  description?: string | null;
  inserted_at?: ISODateTimeString;
};

