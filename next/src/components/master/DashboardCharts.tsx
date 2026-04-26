"use client";

import { formatCurrency } from "@/lib/format";
import { DashboardStatCard } from "./DashboardStatCard";

interface DashboardChartsProps {
  data: Record<string, unknown> | undefined;
  currency?: string;
}

export function DashboardCharts({ data, currency = "USD" }: DashboardChartsProps) {
  if (!data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DashboardStatCard label="Balance" value="-" />
        <DashboardStatCard label="Total Players" value="-" />
        <DashboardStatCard label="Total Bets" value="-" />
        <DashboardStatCard label="Pending Bets" value="-" />
      </div>
    );
  }

  const statItems = [
    { label: "Balance", value: data.balance ?? "-", key: "balance", isMoney: true },
    { label: "Player Balance", value: data.total_player_balance ?? "-", key: "total_player_balance", isMoney: true },
    { label: "Total Players", value: data.total_players ?? "-", key: "total_players" },
    { label: "Total Bets", value: data.total_bets ?? "-", key: "total_bets" },
    { label: "Pending Bets", value: data.pending_bets ?? "-", key: "pending_bets" },
  ];

  const formatValue = (value: unknown, isMoney?: boolean) => {
    if (!isMoney) return String(value);
    return formatCurrency(value, currency);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {statItems.map((item) => (
        <DashboardStatCard
          key={item.key}
          label={item.label}
          value={formatValue(item.value, item.isMoney)}
        />
      ))}
    </div>
  );
}
