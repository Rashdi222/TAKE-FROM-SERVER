"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AuthGuard } from "@/lib/auth/AuthGuard";

const navItems = [
  { href: "/master/dashboard", label: "Dashboard" },
  { href: "/master/players", label: "Players" },
  { href: "/master/deposit", label: "Deposit" },
  { href: "/master/reports", label: "Reports" },
  { href: "/master/payments", label: "Payments" },
  { href: "/master/transactions", label: "Transactions" },
  { href: "/master/reset-support", label: "Reset Support" },
];

function MasterNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {navItems.map((item) => {
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
    </nav>
  );
}

export default function MasterLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard allowedRoles={["master_admin"]}>
      <div className="mx-auto w-full max-w-[88rem] px-3 py-4">
        <div className="sb-app-shell">
          <aside className="sb-side-panel sb-app-sidebar flex w-56 flex-shrink-0 flex-col p-3">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <MasterNav />
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
