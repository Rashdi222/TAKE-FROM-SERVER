import type { ISODateTimeString, UUID } from "../response";

export type PaymentMethodProvider = "easypaisa" | "manual" | string;
export type PaymentTransactionStatus = "pending" | "completed" | "failed" | "cancelled" | string;
export type PaymentTransactionType = "deposit" | "withdrawal" | string;

export type PaymentMethod = {
  id: UUID;
  provider: PaymentMethodProvider;
  method_name?: string;
  is_active: boolean;
  supports_deposit?: boolean;
  supports_withdrawal?: boolean;
  logo_path?: string | null;
  preset_key?: string | null;
  label?: string;
  instructions?: string;
  account_label?: string;
  account_number?: string;
  bank_name?: string;
  account_title?: string;
  iban_or_account_number?: string;
  account_label_hint?: string;
  account_number_label?: string;
  account_number_placeholder?: string;
  instructions_hint?: string;
  sort_order?: number;
  created_by_id?: UUID | null;
  inserted_at?: ISODateTimeString;
  updated_at?: ISODateTimeString;
  [k: string]: unknown;
};

export type PaymentTransaction = {
  id: UUID;
  user_id?: UUID | null;
  payment_method_id?: UUID | null;
  amount: number | string;
  type?: PaymentTransactionType | null;
  status: PaymentTransactionStatus;
  provider_transaction_id?: string | null;
  provider_response?: Record<string, unknown> | null;
  approval_owner_id?: UUID | null;
  reviewed_by_id?: UUID | null;
  reviewed_at?: ISODateTimeString;
  receipt_path?: string | null;
  player?: {
    id: UUID;
    username?: string | null;
    email?: string | null;
    phone_number?: string | null;
  } | null;
  payment_method?: {
    id: UUID;
    provider?: string | null;
    method_name?: string | null;
    bank_name?: string | null;
    account_title?: string | null;
    iban_or_account_number?: string | null;
  } | null;
  inserted_at?: ISODateTimeString;
  updated_at?: ISODateTimeString;
  [k: string]: unknown;
};

export type PaymentApprovalSummary = {
  pending_deposits: number;
  pending_withdrawals: number;
  stale_pending_count: number;
  oldest_pending_at?: ISODateTimeString | null;
};

export type DepositRequest = {
  amount: number;
  payment_method_id: UUID;
  receipt_path: string;
};

export type WithdrawRequest = {
  amount: number;
  payment_method_id: UUID;
  account_title: string;
  account_number: string;
};
