"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CircleUserRound,
  LayoutGrid,
  Wallet,
  ReceiptText,
  Sparkles,
  History,
  ArrowDownCircle,
  ArrowUpCircle,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { useBalance, useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";

type PaneItem = {
  href: string;
  label: string;
  note: string;
  icon: LucideIcon;
  accent: string;
};

const primaryItems: PaneItem[] = [
  {
    href: "/profile",
    label: "Profile",
    note: "Identity, account status, and player information.",
    icon: CircleUserRound,
    accent: "text-sky-300",
  },
  {
    href: "/wallet",
    label: "Wallet",
    note: "Balance, funding controls, and payment visibility.",
    icon: Wallet,
    accent: "text-emerald-300",
  },
  {
    href: "/bets",
    label: "Bets",
    note: "Open tickets, history, and settlement trail.",
    icon: ReceiptText,
    accent: "text-amber-300",
  },
  {
    href: "/sportsbook/results",
    label: "Results",
    note: "Closed boards and published sportsbook outcomes.",
    icon: History,
    accent: "text-violet-300",
  },
  {
    href: "/assistant",
    label: "Assistant",
    note: "Chat support and help workspace.",
    icon: Sparkles,
    accent: "text-fuchsia-300",
  },
  {
    href: "/account",
    label: "Account",
    note: "Preferences and administrator-controlled settings.",
    icon: LayoutGrid,
    accent: "text-cyan-300",
  },
];

const quickActions: Array<{ href: string; label: string; icon: LucideIcon; accent: string }> = [
  { href: "/wallet/deposit", label: "Deposit", icon: ArrowDownCircle, accent: "text-emerald-300" },
  { href: "/wallet/withdraw", label: "Withdraw", icon: ArrowUpCircle, accent: "text-amber-300" },
];

export function UserSettingsPane({ open }: { open: boolean }) {
  const pathname = usePathname();
  const { data: profileData } = useProfile();
  const { data: balanceData, isLoading: balanceLoading } = useBalance();

  const profile = profileData?.data;
  const currency = String(balanceData?.account_currency ?? profile?.account_currency ?? "USD");
  const balance = Number(balanceData?.balance ?? 0);

  return (
    <aside
      className={[
        "hidden h-full shrink-0 overflow-hidden transition-[width,opacity,transform] duration-300 md:block",
        open ? "w-[20rem] opacity-100 translate-x-0" : "w-0 opacity-0 -translate-x-2 pointer-events-none",
      ].join(" ")}
      aria-hidden={!open}
    >
      <div className="h-full rounded-[1.5rem] border border-[var(--c-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-3 shadow-[0_18px_44px_rgba(0,0,0,0.24)]">
        <div className="flex h-full flex-col gap-3">
          <Card
            variant="surface-2"
            className="border-[rgba(161,121,241,0.2)] bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-4"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
              Player Control
            </div>
            <div className="mt-2 text-lg font-semibold text-[var(--c-text)]">
              {profile?.username ? `@${profile.username}` : "Player Workspace"}
            </div>
            <div className="mt-1 text-sm text-[var(--c-text-muted)]">
              {balanceLoading ? "---" : formatCurrency(balance, currency)}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <PaneStatCard label="Currency" value={currency} />
            <PaneStatCard label="Status" value={profile?.is_active ? "Active" : "Live"} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-[1rem] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3 transition hover:border-[var(--c-accent)] hover:bg-[rgba(255,255,255,0.05)]"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--c-text)]">
                    <Icon className={`h-4.5 w-4.5 ${item.accent}`} />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="sb-pane-scroll min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="space-y-2">
              {primaryItems.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href !== "/sportsbook/results" && pathname.startsWith(`${item.href}/`));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "block rounded-[1rem] border px-3 py-3 transition",
                      active
                        ? "border-[rgba(161,121,241,0.34)] bg-[linear-gradient(135deg,rgba(58,139,255,0.14),rgba(99,32,232,0.18))]"
                        : "border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] hover:border-[var(--c-accent)] hover:bg-[rgba(255,255,255,0.05)]",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.12)] p-2">
                        <Icon className={`h-4.5 w-4.5 ${item.accent}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--c-text)]">{item.label}</div>
                        <div className="mt-1 text-xs leading-5 text-[var(--c-text-muted)]">{item.note}</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[var(--c-border)] pt-3">
            <LogoutButton className="w-full justify-center" />
          </div>
        </div>
      </div>
    </aside>
  );
}

function PaneStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-[var(--c-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{label}</div>
      <div className="mt-2 text-sm font-semibold text-[var(--c-text)]">{value}</div>
    </div>
  );
}
