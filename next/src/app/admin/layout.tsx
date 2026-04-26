"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AuthGuard } from "@/lib/auth/AuthGuard";

const navSections = [
  {
    title: "Core",
    items: [
      { href: "/admin/operations", label: "Operations" },
      { href: "/admin/providers", label: "Providers" },
      { href: "/admin/feeds", label: "Feeds" },
      { href: "/admin/live-polling", label: "Live Polling" },
      { href: "/admin/matches", label: "Imported Matches" },
      { href: "/admin/multi-source/matchmaker", label: "Matchmaker" },
      { href: "/admin/dashboard", label: "Dashboard" },
    ],
  },
  {
    title: "Sports",
    items: [
      { href: "/admin/cricket", label: "Cricket" },
      { href: "/admin/football", label: "Football" },
    ],
  },
  {
    title: "Tennis",
    items: [{ href: "/admin/tennis", label: "Command Center" }],
  },
  {
    title: "Admin",
    items: [
      { href: "/admin/sports-data/events", label: "Sports Data" },
      { href: "/admin/bets", label: "Bets" },
      { href: "/admin/master-admins", label: "Master Admins" },
      { href: "/admin/players", label: "Players" },
      { href: "/admin/payments", label: "Payments" },
      { href: "/admin/payments/approvals", label: "Payment Approvals" },
      { href: "/admin/assistant", label: "Assistant" },
      { href: "/admin/reports", label: "Reports" },
      { href: "/admin/reset-support", label: "Reset Support" },
      { href: "/admin/settings/market-templates", label: "Market Templates" },
      { href: "/admin/settings/currencies", label: "Currencies" },
      { href: "/admin/settings/landing-whatsapp", label: "Landing WhatsApp" },
      { href: "/admin/settings/ai", label: "AI Settings" },
    ],
  },
];

function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-4">
      {navSections.map((section) => (
        <div key={section.title} className="space-y-1">
          <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">
            {section.title}
          </div>
          {section.items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={isActive}
                className="sb-nav-link"
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard allowedRoles={["super_admin"]}>
      <div className="mx-auto w-full max-w-[88rem] px-3 py-4">
        <div className="sb-app-shell">
          <aside className="sb-side-panel sb-app-sidebar flex w-60 flex-shrink-0 flex-col p-3">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <AdminNav />
            </div>
            <div className="mt-4 border-t border-[var(--c-border)] pt-4">
              <LogoutButton className="w-full justify-center" />
            </div>
          </aside>
          <main className="sb-app-main">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
