"use client";

import { Card } from "../ui/Card";

interface SuperDashboardStatCardProps {
  label: string;
  value: string | number;
  variant?: "default" | "success" | "danger" | "warning";
}

export function SuperDashboardStatCard({ label, value, variant = "default" }: SuperDashboardStatCardProps) {
  const valueColor = {
    default: "text-[var(--c-text)]",
    success: "text-[var(--c-success)]",
    danger: "text-[var(--c-danger)]",
    warning: "text-[var(--c-warning)]",
  };

  return (
    <Card variant="surface-2" className="p-6">
      <p className="text-sm text-[var(--c-text-muted)] mb-1">{label}</p>
      <p className={`text-3xl font-mono font-bold ${valueColor[variant]}`}>{value}</p>
    </Card>
  );
}
