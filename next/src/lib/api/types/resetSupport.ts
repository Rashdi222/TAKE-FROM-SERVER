import type { ISODateTimeString, UUID } from "../response";

export type ResetSupportChannel = "whatsapp" | "phone" | "email";

export type ResetSupportContact = {
  id: UUID;
  owner_type?: "super_admin" | "master_admin";
  owner_id?: UUID;
  channel: ResetSupportChannel;
  label?: string | null;
  value: string;
  is_active: boolean;
  inserted_at?: ISODateTimeString;
  updated_at?: ISODateTimeString;
};

export type ForgotPasswordSupportLookupResponse = {
  available: boolean;
  owner_type?: "super_admin" | "master_admin";
  owner_name?: string | null;
  message: string;
  requester?: {
    username?: string | null;
    email?: string | null;
    phone_number?: string | null;
    account_currency?: string | null;
    balance?: string | null;
  } | null;
  contacts: ResetSupportContact[];
};
