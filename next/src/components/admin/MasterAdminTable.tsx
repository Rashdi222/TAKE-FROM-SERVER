"use client";

import { formatCurrency } from "@/lib/format";
import { Card } from "../ui/Card";

interface MasterAdmin {
  id: string;
  username?: string | null;
  email?: string;
  balance?: number | string;
  account_currency?: string;
  supported_account_currencies?: string[] | null;
  is_active?: boolean;
  inserted_at?: string;
}

interface MasterAdminTableProps {
  masterAdmins: MasterAdmin[];
  onSelect: (id: string) => void;
}

export function MasterAdminTable({ masterAdmins, onSelect }: MasterAdminTableProps) {
  if (masterAdmins.length === 0) {
    return (
      <Card variant="surface-1" className="p-6">
        <p className="text-[var(--c-text-muted)] text-center">No master admins found</p>
      </Card>
    );
  }

  return (
    <Card variant="surface-1" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--c-border)]">
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Username</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Email</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Balance</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Currencies</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Created</th>
            </tr>
          </thead>
          <tbody>
            {masterAdmins.map((admin) => (
              <tr
                key={admin.id}
                className="cursor-pointer border-b border-[var(--c-border)] last:border-0 hover:bg-[var(--c-surface-2)]"
                onClick={() => onSelect(admin.id)}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="text-[var(--c-accent)] hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(admin.id);
                    }}
                  >
                    {admin.username || "-"}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm text-[var(--c-text)]">{admin.email || "-"}</td>
                <td className="px-4 py-3 text-sm font-mono text-[var(--c-text)]">
                  {formatCurrency(admin.balance ?? 0, String(admin.account_currency ?? "USD"))}
                </td>
                <td className="px-4 py-3 text-xs uppercase tracking-[0.12em] text-[var(--c-text-faint)]">
                  {(admin.supported_account_currencies?.length ? admin.supported_account_currencies : [admin.account_currency]).filter(Boolean).join(", ") || "-"}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={admin.is_active ? "text-[var(--c-success)]" : "text-[var(--c-danger)]"}>
                    {admin.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-[var(--c-text-muted)]">
                  {admin.inserted_at ? new Date(admin.inserted_at).toLocaleDateString() : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
