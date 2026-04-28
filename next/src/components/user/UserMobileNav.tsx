"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  CircleUserRound,
  LayoutGrid,
  Wallet,
  ReceiptText,
  History,
  ShieldPlus,
  X,
  Home,
  type LucideIcon,
} from "lucide-react";
import { useBalance, useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { SPORTBOOK_SPORTS } from "@/components/user/sportsbook/sports";

const bottomItems = [
  { href: "/sportsbook/home", label: "Home", icon: Home, color: "text-sky-300" },
  { href: "/profile", label: "Profile", icon: CircleUserRound, color: "text-fuchsia-300" },
  { href: "/wallet", label: "Wallet", icon: Wallet, color: "text-emerald-300" },
  { href: "/bets", label: "Bets", icon: ReceiptText, color: "text-amber-300" },
  { href: "/account", label: "Account", icon: LayoutGrid, color: "text-violet-300" },
];

function MobileNavLink({
  href,
  label,
  icon: Icon,
  color,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  color: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch
      className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 transition ${
        active
          ? "bg-[rgba(99,32,232,0.18)] text-[var(--c-text)] shadow-[0_8px_18px_rgba(0,0,0,0.14)]"
          : "text-[var(--c-text-muted)]"
      }`}
    >
      <Icon className={`h-5 w-5 ${color}`} />
      <span className="truncate text-[11px] tracking-[0.04em]">{label}</span>
    </Link>
  );
}

export function UserMobileNav() {
  const pathname = usePathname();
  const { data, isLoading } = useBalance();
  const { data: profileData } = useProfile();
  const [open, setOpen] = useState(false);
  const balance = Number(data?.balance ?? 0);
  const currency = String(data?.account_currency ?? profileData?.data?.account_currency ?? "USD");
  const walletMode = profileData?.data?.wallet_mode ?? "self_service";
  const drawerItems = [
    { href: "/sportsbook/results", label: "Results" },
    ...(walletMode === "self_service"
      ? [
          { href: "/wallet/deposit", label: "Deposit" },
          { href: "/wallet/withdraw", label: "Withdraw" },
        ]
      : []),
    { href: "/assistant", label: "Assistant" },
    { href: "/wallet/transactions", label: "Transactions" },
    { href: "/account", label: "Account Settings" },
  ];

  return (
    <>
      {/* Bottom nav bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3 md:hidden">
        <div className="pointer-events-auto relative rounded-[1.75rem] border border-[var(--c-border-strong)] bg-[rgba(20,18,38,0.86)] px-3 pb-3 pt-2 shadow-[0_-12px_40px_rgba(0,0,0,0.32)] backdrop-blur-[20px]">
          <div className="grid grid-cols-[1fr_1fr_auto_1fr_1fr] items-end gap-2">
            <MobileNavLink {...bottomItems[0]} active={pathname.startsWith("/sportsbook/home") || pathname === "/sportsbook/home"} />
            <MobileNavLink {...bottomItems[1]} active={pathname.startsWith(bottomItems[1].href)} />

            <button
              type="button"
              aria-label={open ? "Close player drawer" : "Open player drawer"}
              onClick={() => setOpen((value) => !value)}
              className="relative -mt-8 flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(161,121,241,0.3)] bg-[linear-gradient(135deg,rgba(58,139,255,0.95),rgba(99,32,232,0.95))] text-white shadow-[0_18px_40px_rgba(58,139,255,0.3)]"
            >
              {open ? <X className="h-6 w-6" /> : <ShieldPlus className="h-6 w-6" />}
            </button>

            <MobileNavLink {...bottomItems[2]} active={pathname.startsWith(bottomItems[2].href)} />
            <MobileNavLink {...bottomItems[3]} active={pathname.startsWith(bottomItems[3].href)} />
          </div>
        </div>
      </div>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-[rgba(7,6,15,0.58)] transition-opacity duration-300 md:hidden ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
      />

      {/* Drawer */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[60] rounded-t-[2rem] border border-b-0 border-[var(--c-border-strong)] bg-[linear-gradient(180deg,rgba(30,27,49,0.96),rgba(15,13,26,0.98))] px-5 pb-8 pt-5 shadow-[0_-24px_60px_rgba(0,0,0,0.42)] backdrop-blur-[20px] transition-transform duration-300 ease-out md:hidden ${
          open ? "translate-y-0" : "translate-y-[105%]"
        }`}
      >
        <div className="mx-auto max-w-md">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
                Player Wallet
              </p>
              <p className="mt-2 text-3xl font-semibold text-[var(--c-text)]">
                {isLoading ? "---" : formatCurrency(balance, currency)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-[var(--c-border)] p-2 text-[var(--c-text-muted)]"
              aria-label="Close player drawer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3">
            <Link
              href="/wallet/deposit"
              onClick={() => setOpen(false)}
              className="rounded-[1rem] border border-[rgba(161,121,241,0.26)] bg-[var(--c-accent)] px-4 py-3 text-center text-sm font-medium text-[var(--c-text)] shadow-[0_10px_28px_rgba(99,32,232,0.24)]"
            >
              Deposit
            </Link>
            <Link
              href="/wallet/withdraw"
              onClick={() => setOpen(false)}
              className="rounded-[1rem] border border-[var(--c-accent)] px-4 py-3 text-center text-sm font-medium text-[var(--c-text)]"
            >
              Withdraw
            </Link>
          </div>

          <div className="space-y-2">
            {drawerItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-[1rem] border border-[var(--c-border)] px-4 py-3 text-sm text-[var(--c-text-muted)] transition hover:border-[var(--c-accent)] hover:text-[var(--c-text)]"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="mt-5">
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Sports</p>
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/sportsbook/results"
                onClick={() => setOpen(false)}
                className={`rounded-[1rem] border px-4 py-3 transition ${
                  pathname === "/sportsbook/results"
                    ? "border-[rgba(161,121,241,0.32)] bg-[rgba(99,32,232,0.16)]"
                    : "border-[var(--c-border)] bg-[rgba(255,255,255,0.02)]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <History className="h-4.5 w-4.5 text-indigo-300" />
                  <span className="text-sm text-[var(--c-text)]">Results</span>
                </div>
              </Link>
              {SPORTBOOK_SPORTS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  onClick={() => setOpen(false)}
                  className={`rounded-[1rem] border px-4 py-3 transition ${
                    pathname === item.href
                      ? "border-[rgba(161,121,241,0.32)] bg-[rgba(99,32,232,0.16)]"
                      : "border-[var(--c-border)] bg-[rgba(255,255,255,0.02)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className={`h-4.5 w-4.5 ${item.iconColor}`} />
                    <span className="text-sm text-[var(--c-text)]">{item.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-5 border-t border-[var(--c-border)] pt-5">
            <LogoutButton className="w-full justify-center" />
          </div>
        </div>
      </div>
    </>
  );
}
