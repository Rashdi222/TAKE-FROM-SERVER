"use client";

import { Card } from "@/components/ui/Card";
import { CurrencyBreakdown } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

export function PlatformCurrencyBreakdownTable({
  items,
  title = "Per-Currency Totals",
  wrap = true,
}: {
  items: CurrencyBreakdown[];
  title?: string;
  wrap?: boolean;
}) {
  const rows = items.filter(
    (item) => Number(item.user_count ?? 0) > 0 || Number(item.total_balance ?? 0) > 0
  );

  if (rows.length === 0) return null;

  const table = (
    <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="border-b border-[var(--c-border)] bg-[var(--c-surface-2)]/50">
              <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Currency</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Accounts</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Balance</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Volume</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Payouts</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Net Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.code} className="border-b border-[var(--c-border)] last:border-b-0 hover:bg-[var(--c-surface-2)]/40">
                <td className="px-4 py-4 text-sm text-[var(--c-text)]">
                  {item.flag} {item.code}
                </td>
                <td className="px-4 py-4 text-sm text-[var(--c-text)]">{item.user_count ?? 0}</td>
                <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{formatCurrency(item.total_balance, item.code)}</td>
                <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{formatCurrency(item.total_volume, item.code)}</td>
                <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{formatCurrency(item.total_payouts, item.code)}</td>
                <td className="px-4 py-4 font-mono text-sm text-[var(--c-success)]">{formatCurrency(item.net_revenue, item.code)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );

  if (!wrap) {
    return (
      <>
        {title ? <h2 className="text-xl font-semibold text-[var(--c-text)]">{title}</h2> : null}
        {title ? <div className="mt-4">{table}</div> : table}
      </>
    );
  }

  return (
    <Card variant="surface-2" className="p-6">
      {title ? <h2 className="text-xl font-semibold text-[var(--c-text)]">{title}</h2> : null}
      {title ? <div className="mt-4">{table}</div> : table}
    </Card>
  );
}
