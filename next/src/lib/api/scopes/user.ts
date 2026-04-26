import { request } from "../http";
import type { DataResponse, ListResponse } from "../response";
import type { AssistantConversation, AssistantMessage } from "../types/assistant";
import type { Bet, CreateBetRequest } from "../types/bets";
import type { PaymentMethod, PaymentTransaction } from "../types/payments";
import type { AccountTransaction } from "../types/transactions";
import type { UserProfile } from "../types/auth";

export const userApi = {
  auth: {
    me: () => request("GET", "/api/auth/me", { auth: true }),
    logout: () => request("POST", "/api/auth/logout", { auth: true }),
  },
  profile: {
    get: () => request<DataResponse<UserProfile>>("GET", "/api/user/profile", { auth: true }),
    balance: () => request<{ balance: number | string; account_currency?: string }>("GET", "/api/user/balance", { auth: true }),
    transactions: () => request<ListResponse<AccountTransaction>>("GET", "/api/user/transactions", { auth: true }),
  },
  payments: {
    methods: (query?: { purpose?: "deposit" | "withdrawal" }) =>
      request<ListResponse<PaymentMethod>>("GET", "/api/wallet/payment-methods", { auth: true, query }),
    supportContacts: () => request<DataResponse<import("../types/resetSupport").ForgotPasswordSupportLookupResponse>>("GET", "/api/payments/support-contacts", { auth: true }),
    uploadDepositReceipt: (body: FormData) => request<{ data: { receipt_path: string; file_name?: string; content_type?: string; size?: number } }>("POST", "/api/wallet/deposit/upload", { auth: true, body }),
    deposit: (body: { amount: number; payment_method_id: string; receipt_path: string }) => request("POST", "/api/payments/deposit", { auth: true, body }),
    withdraw: (body: { amount: number; payment_method_id: string; account_title: string; account_number: string }) =>
      request("POST", "/api/payments/withdraw", { auth: true, body }),
    transactions: () => request<ListResponse<PaymentTransaction>>("GET", "/api/payments/transactions", { auth: true }),
  },
  assistant: {
    conversations: () => request<ListResponse<AssistantConversation>>("GET", "/api/user/assistant/conversations", { auth: true }),
    createConversation: (body?: { title?: string }) =>
      request<DataResponse<AssistantConversation>>("POST", "/api/user/assistant/conversations", { auth: true, body: body ?? {} }),
    messages: (id: string) =>
      request<{ data: { conversation: AssistantConversation; messages: AssistantMessage[] } }>(
        "GET",
        `/api/user/assistant/conversations/${id}/messages`,
        { auth: true }
      ),
    sendMessage: (id: string, body: { content: string }) =>
      request<{ data: { conversation: AssistantConversation; user_message: AssistantMessage; assistant_message: AssistantMessage } }>(
        "POST",
        `/api/user/assistant/conversations/${id}/messages`,
        { auth: true, body }
      ),
  },
  bets: {
    create: (body: CreateBetRequest) => request<DataResponse<Bet>>("POST", "/api/bets", { auth: true, body }),
    list: () => request<ListResponse<Bet>>("GET", "/api/bets", { auth: true }),
    get: (id: string) => request<DataResponse<Bet>>("GET", `/api/bets/${id}`, { auth: true }),
    cancel: (id: string) => request<DataResponse<Bet>>("DELETE", `/api/bets/${id}`, { auth: true }),
  },
};
