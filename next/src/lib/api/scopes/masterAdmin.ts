import { request } from "../http";
import type { QueryParams } from "../http";

export const masterAdminApi = {
  dashboard: () => request("GET", "/api/master-admin/dashboard", { auth: true }),
  players: {
    create: (body: Record<string, unknown>) => request("POST", "/api/master-admin/players", { auth: true, body }),
    list: () => request("GET", "/api/master-admin/players", { auth: true }),
    topup: (id: string, body: Record<string, unknown>) =>
      request("POST", `/api/master-admin/players/${id}/topup`, { auth: true, body }),
    deduct: (id: string, body: Record<string, unknown>) =>
      request("POST", `/api/master-admin/players/${id}/deduct`, { auth: true, body }),
    ledger: (id: string, query?: QueryParams) =>
      request("GET", `/api/master-admin/players/${id}/ledger`, { auth: true, query }),
    stats: (id: string) => request("GET", `/api/master-admin/players/${id}/stats`, { auth: true }),
    betsReport: (id: string, query?: QueryParams) =>
      request("GET", `/api/master-admin/players/${id}/bets-report`, { auth: true, query }),
    reportExport: (id: string, query?: QueryParams) =>
      request("GET", `/api/master-admin/players/${id}/report-export`, { auth: true, query }),
    setPassword: (id: string, body: Record<string, unknown>) =>
      request("POST", `/api/master-admin/players/${id}/set-password`, { auth: true, body }),
    generateResetLink: (id: string, body?: Record<string, unknown>) =>
      request("POST", `/api/master-admin/players/${id}/password-reset-link`, {
        auth: true,
        body: body ?? {},
      }),
  },
  transactions: () => request("GET", "/api/master-admin/transactions", { auth: true }),
  payments: {
    methods: () => request("GET", "/api/master-admin/payments/methods", { auth: true }),
    method: (id: string) => request("GET", `/api/master-admin/payments/methods/${id}`, { auth: true }),
    configureMethod: (body: Record<string, unknown>) => request("POST", "/api/master-admin/payments/methods", { auth: true, body }),
    uploadMethodLogo: (body: FormData) => request("POST", "/api/master-admin/payments/methods/logo/upload", { auth: true, body }),
    updateMethod: (id: string, body: Record<string, unknown>) => request("PUT", `/api/master-admin/payments/methods/${id}`, { auth: true, body }),
    activateMethod: (id: string) => request("POST", `/api/master-admin/payments/methods/${id}/activate`, { auth: true }),
    deactivateMethod: (id: string) => request("POST", `/api/master-admin/payments/methods/${id}/deactivate`, { auth: true }),
    approvals: () => request("GET", "/api/master-admin/payments/approvals", { auth: true }),
    approvalSummary: () => request("GET", "/api/master-admin/payments/approvals/summary", { auth: true }),
    approveDeposit: (id: string) => request("POST", `/api/master-admin/payments/deposits/${id}/approve`, { auth: true }),
    rejectDeposit: (id: string, body?: Record<string, unknown>) =>
      request("POST", `/api/master-admin/payments/deposits/${id}/reject`, { auth: true, body: body ?? {} }),
    approveWithdrawal: (id: string) => request("POST", `/api/master-admin/payments/withdrawals/${id}/approve`, { auth: true }),
    rejectWithdrawal: (id: string, body?: Record<string, unknown>) =>
      request("POST", `/api/master-admin/payments/withdrawals/${id}/reject`, { auth: true, body: body ?? {} }),
    receipt: (id: string) => request("GET", `/api/master-admin/payments/transactions/${id}/receipt`, { auth: true }),
    transactions: () => request("GET", "/api/master-admin/payments/transactions", { auth: true }),
    supportContacts: () => request("GET", "/api/master-admin/payments/support-contacts", { auth: true }),
  },
  reports: {
    my: (query?: QueryParams) => request("GET", "/api/reports/my", { auth: true, query }),
    ledger: (query?: QueryParams) => request("GET", "/api/reports/ledger", { auth: true, query }),
  },
  resetSupport: {
    list: () => request("GET", "/api/master-admin/reset-support/contacts", { auth: true }),
    create: (body: Record<string, unknown>) =>
      request("POST", "/api/master-admin/reset-support/contacts", { auth: true, body }),
    update: (id: string, body: Record<string, unknown>) =>
      request("PUT", `/api/master-admin/reset-support/contacts/${id}`, { auth: true, body }),
    delete: (id: string) => request("DELETE", `/api/master-admin/reset-support/contacts/${id}`, { auth: true }),
  },
};
