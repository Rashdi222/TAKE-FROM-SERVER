"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const items = [
  { href: "/admin/tennis?tab=upcoming", tab: "upcoming", label: "Fixtures" },
  { href: "/admin/tennis?tab=tracked", tab: "tracked", label: "Live Tracking" },
  { href: "/admin/tennis?tab=desk", tab: "desk", label: "Publishing Desk" },
];

export function TennisAdminSubnav() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "upcoming";

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = activeTab === item.tab;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
              active
                ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
