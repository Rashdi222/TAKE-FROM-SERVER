"use client";

import { Card } from "../ui/Card";

interface DashboardStatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  variant?: "default" | "success" | "danger";
}

export function DashboardStatCard({ label, value, trend, variant = "default" }: DashboardStatCardProps) {
  const valueColor = {
    default: "text-[var(--c-text)]",
    success: "text-[var(--c-success)]",
    danger: "text-[var(--c-danger)]",
  };

  return (
    <Card variant="surface-2" className="p-6">
      <p className="text-sm text-[var(--c-text-muted)] mb-1">{label}</p>
      <p className={`text-3xl font-mono font-bold ${valueColor[variant]}`}>{value}</p>
      {trend && <p className="text-xs text-[var(--c-text-faint)] mt-2">{trend}</p>}
    </Card>
  );
}
