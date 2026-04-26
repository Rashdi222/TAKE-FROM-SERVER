"use client";

import { useProfile } from "@/hooks/useProfile";
import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";

interface UserProfile {
  email?: string;
  role?: string;
  account_currency?: string;
  balance?: number | string;
  is_active?: boolean;
  inserted_at?: string;
}

export default function ProfilePage() {
  const { data, isLoading } = useProfile();
  const profile = (data as { data?: UserProfile } | undefined)?.data;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-[var(--c-text-muted)]">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
          Player Profile
        </p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--c-text)]">Profile</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <ProfileStatCard label="Email" value={profile?.email || "-"} />
        <ProfileStatCard label="Role" value={profile?.role ? capitalize(profile.role) : "-"} />
        <ProfileStatCard
          label="Balance"
          value={formatCurrency(profile?.balance ?? 0, String(profile?.account_currency ?? "USD"))}
        />
        <ProfileStatCard label="Account Currency" value={profile?.account_currency || "-"} />
        <ProfileStatCard label="Status" value={profile?.is_active ? "Active" : "Inactive"} />
        <ProfileStatCard
          label="Joined"
          value={profile?.inserted_at ? new Date(profile.inserted_at).toLocaleString() : "-"}
        />
      </div>

      <Card
        variant="surface-2"
        className="mt-6 max-w-3xl border-[rgba(161,121,241,0.18)] bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-6"
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--c-text-faint)]">
          Account Snapshot
        </div>
        <p className="mt-3 text-sm leading-7 text-[var(--c-text-muted)]">
          This panel shows the current player account state as provisioned on the platform. Any restricted identity or
          risk-setting changes remain controlled through administrator workflows.
        </p>
      </Card>
    </div>
  );
}

function ProfileStatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card
      variant="surface-2"
      className="border-[var(--c-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{label}</div>
      <div className="mt-3 text-lg font-semibold leading-7 text-[var(--c-text)] break-words">{value}</div>
    </Card>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
