"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CircleUserRound,
  History,
  LayoutGrid,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { useBalance, useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";

type TabId = "profile" | "wallet" | "bets" | "account";

const TABS: Array<{
  id: TabId;
  label: string;
  icon: typeof CircleUserRound;
}> = [
  { id: "profile", label: "Profile", icon: CircleUserRound },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "bets", label: "Bets", icon: ReceiptText },
  { id: "account", label: "Account", icon: LayoutGrid },
];

export function UserProfileHubModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const { data: profileData } = useProfile();
  const { data: balanceData, isLoading: balanceLoading } = useBalance();
  const profile = profileData?.data;
  const currency = String(balanceData?.account_currency ?? profile?.account_currency ?? "USD");
  const balance = Number(balanceData?.balance ?? 0);
  const tabContent = useMemo(() => {
    switch (activeTab) {
      case "wallet":
        return (
          <div className="grid gap-4">
            <QuickStat
              label="Available Balance"
              value={balanceLoading ? "---" : formatCurrency(balance, currency)}
            />
            <ActionGrid
              items={
                [
                  { href: "/wallet/deposit", label: "Deposit", note: "Fund the account and upload your receipt for approval." },
                  { href: "/wallet/withdraw", label: "Withdraw", note: "Move funds out through the approved payment flow." },
                  { href: "/wallet/transactions", label: "Transactions", note: "Inspect ledger movement and history." },
                  { href: "/wallet", label: "Wallet Home", note: "Open the full wallet workspace." },
                ].filter(Boolean) as Array<{ href: string; label: string; note: string }>
              }
            />
          </div>
        );
      case "bets":
        return (
          <div className="grid gap-4">
            <QuickStat label="Bet Desk" value="Open slips, history and result tracking" />
            <ActionGrid
              items={[
                { href: "/bets", label: "Active Bets", note: "Review pending and settled bets." },
                { href: "/sportsbook/results", label: "Results", note: "Check closed boards and published outcomes." },
              ]}
            />
          </div>
        );
      case "account":
        return (
          <div className="grid gap-4">
            <QuickStat
              label="Account Controls"
              value={profile?.username ? `@${profile.username}` : "Player account"}
            />
            <ActionGrid
              items={[
                { href: "/account", label: "Account Settings", note: "Update account preferences and controls." },
                { href: "/profile", label: "Profile Page", note: "View identity and personal account fields." },
              ]}
            />
          </div>
        );
      case "profile":
      default:
        return (
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <QuickStat label="Username" value={profile?.username ? `@${profile.username}` : "Player"} />
              <QuickStat label="Currency" value={currency} />
            </div>
            <ActionGrid
              items={[
                { href: "/profile", label: "Open Profile", note: "Inspect personal details and support info." },
                { href: "/account", label: "Settings", note: "Adjust account preferences without leaving the app." },
                { href: "/bets", label: "Bet History", note: "Review tickets, exposure and settled outcomes." },
                { href: "/sportsbook/results", label: "Results", note: "Check final results from the sportsbook." },
              ]}
            />
          </div>
        );
    }
  }, [activeTab, balance, balanceLoading, currency, profile]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Player Hub"
      className="max-w-4xl"
      contentClassName="space-y-5"
    >
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="lg:w-56 lg:flex-shrink-0">
          <div className="rounded-[1.25rem] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] p-3">
            <div className="rounded-[1rem] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(135deg,rgba(58,139,255,0.18),rgba(99,32,232,0.16))] p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--c-text-faint)]">
                Player
              </div>
              <div className="mt-2 text-lg font-semibold text-[var(--c-text)]">
                {profile?.username ? `@${profile.username}` : "Account Hub"}
              </div>
              <div className="mt-1 text-sm text-[var(--c-text-muted)]">
                {balanceLoading ? "---" : formatCurrency(balance, currency)}
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {TABS.map((tab) => {
                const active = tab.id === activeTab;
                const Icon = tab.icon;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      "flex w-full items-center gap-3 rounded-[1rem] border px-3 py-3 text-left text-sm font-medium transition",
                      active
                        ? "border-[rgba(161,121,241,0.34)] bg-[rgba(99,32,232,0.18)] text-[var(--c-text)]"
                        : "border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] text-[var(--c-text-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-text)]",
                    ].join(" ")}
                  >
                    <Icon className="h-4.5 w-4.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {tabContent}

          <div className="mt-5 border-t border-[var(--c-border)] pt-5">
            <LogoutButton className="w-full justify-center sm:w-auto" />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.15rem] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--c-text-faint)]">{label}</div>
      <div className="mt-2 text-base font-semibold text-[var(--c-text)]">{value}</div>
    </div>
  );
}

function ActionGrid({
  items,
}: {
  items: Array<{ href: string; label: string; note: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-[1.15rem] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] p-4 transition hover:border-[var(--c-accent)]"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--c-text)]">
            {item.label}
            <History className="h-4 w-4 text-[var(--c-text-faint)]" />
          </div>
          <div className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">{item.note}</div>
        </Link>
      ))}
    </div>
  );
}
