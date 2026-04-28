"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bot,
  Brain,
  CircleDollarSign,
  Coins,
  DatabaseZap,
  Gauge,
  HeartPulse,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  ListChecks,
  Plus,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AuthGuard } from "@/lib/auth/AuthGuard";

const navSections = [
  {
    title: "Core",
    items: [
      { href: "/admin/operations", label: "Operations", icon: Gauge },
      { href: "/admin/providers", label: "Providers", icon: RadioTower },
      { href: "/admin/feeds", label: "Feeds", icon: DatabaseZap },
      { href: "/admin/live-polling", label: "Live Polling", icon: Activity },
      { href: "/admin/matches", label: "Imported Matches", icon: Trophy },
      { href: "/admin/multi-source/matchmaker", label: "Matchmaker", icon: ListChecks },
      { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "Sports",
    items: [
      { href: "/admin/cricket", label: "Cricket", icon: Sparkles },
      { href: "/admin/football", label: "Football", icon: HeartPulse },
    ],
  },
  {
    title: "Tennis",
    items: [{ href: "/admin/tennis", label: "Command Center", icon: LineChart }],
  },
  {
    title: "Admin",
    items: [
      { href: "/admin/sports-data/events", label: "Sports Data", icon: DatabaseZap },
      { href: "/admin/bets", label: "Bets", icon: CircleDollarSign },
      { href: "/admin/master-admins", label: "Master Admins", icon: ShieldCheck },
      { href: "/admin/players", label: "Players", icon: Users },
      { href: "/admin/payments", label: "Payments", icon: WalletCards },
      { href: "/admin/payments/approvals", label: "Payment Approvals", icon: Landmark },
      { href: "/admin/assistant", label: "Assistant", icon: Bot },
      { href: "/admin/reports", label: "Reports", icon: BarChart3 },
      { href: "/admin/reset-support", label: "Reset Support", icon: LifeBuoy },
      { href: "/admin/settings/market-templates", label: "Market Templates", icon: ListChecks },
      { href: "/admin/settings/currencies", label: "Currencies", icon: Coins },
      { href: "/admin/settings/landing-whatsapp", label: "Landing WhatsApp", icon: Landmark },
      { href: "/admin/settings/ai", label: "AI Settings", icon: Brain },
    ],
  },
];

const allNavItems = navSections.flatMap((section) => section.items);
const mobilePrimaryHrefs = [
  "/admin/dashboard",
  "/admin/operations",
  "/admin/matches",
  "/admin/payments",
];
const mobilePrimaryItems = mobilePrimaryHrefs
  .map((href) => allNavItems.find((item) => item.href === href))
  .filter((item): item is (typeof allNavItems)[number] => Boolean(item));

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
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={isActive}
                className="sb-nav-link flex items-center gap-3"
              >
                <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function AdminMobileBottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isPrimaryActive = mobilePrimaryItems.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );

  return (
    <>
      {menuOpen && (
        <div className="sb-admin-bottom-menu">
          <div className="sb-admin-bottom-menu-panel">
            {navSections.map((section) => (
              <div key={section.title} className="space-y-2">
                <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
                  {section.title}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        data-active={isActive}
                        className="sb-admin-bottom-menu-link"
                        onClick={() => setMenuOpen(false)}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <nav className="sb-admin-bottom-nav" aria-label="Super admin mobile navigation">
        <div className="sb-admin-bottom-grid">
          {mobilePrimaryItems.slice(0, 2).map((item) => (
            <AdminMobilePrimaryLink
              key={item.href}
              item={item}
              pathname={pathname}
              onNavigate={() => setMenuOpen(false)}
            />
          ))}

          <button
            type="button"
            className="sb-admin-bottom-plus"
            data-active={menuOpen || !isPrimaryActive}
            aria-label={menuOpen ? "Close admin navigation menu" : "Open admin navigation menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <Plus className="h-6 w-6" aria-hidden="true" />}
          </button>

          {mobilePrimaryItems.slice(2, 4).map((item) => (
            <AdminMobilePrimaryLink
              key={item.href}
              item={item}
              pathname={pathname}
              onNavigate={() => setMenuOpen(false)}
            />
          ))}
        </div>
      </nav>
    </>
  );
}

function AdminMobilePrimaryLink({
  item,
  pathname,
  onNavigate,
}: {
  item: (typeof allNavItems)[number];
  pathname: string;
  onNavigate: () => void;
}) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      data-active={isActive}
      className="sb-admin-bottom-link"
      aria-label={item.label}
      onClick={onNavigate}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
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
      <AdminMobileBottomNav />
    </AuthGuard>
  );
}
