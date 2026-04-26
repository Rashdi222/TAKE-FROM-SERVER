"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings2 } from "lucide-react";
import { SPORTBOOK_SPORTS } from "@/components/user/sportsbook/sports";

export function UserSportRail({
  settingsOpen,
  onToggleSettings,
}: {
  settingsOpen: boolean;
  onToggleSettings: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden h-full w-16 shrink-0 flex-col rounded-[1.5rem] border border-[var(--c-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] p-2 shadow-[0_18px_44px_rgba(0,0,0,0.24)] md:flex">
      <div className="flex flex-1 flex-col items-center gap-2">
        {SPORTBOOK_SPORTS.map((sport) => {
          const active = pathname === sport.href;
          const Icon = sport.icon;

          return (
            <Link
              key={sport.id}
              href={sport.href}
              prefetch
              className={[
                "flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-200",
                active
                  ? "border-[rgba(161,121,241,0.34)] bg-[linear-gradient(135deg,rgba(58,139,255,0.18),rgba(99,32,232,0.24))] shadow-[0_12px_30px_rgba(0,0,0,0.2)]"
                  : "border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] hover:border-[var(--c-accent)] hover:bg-[rgba(255,255,255,0.05)]",
              ].join(" ")}
              aria-label={sport.label}
              title={sport.label}
            >
              <Icon className={`h-4.5 w-4.5 ${sport.iconColor}`} />
            </Link>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onToggleSettings}
        className={[
          "mt-2 flex h-11 w-11 items-center justify-center self-center rounded-xl border transition",
          settingsOpen
            ? "border-[rgba(161,121,241,0.34)] bg-[linear-gradient(135deg,rgba(58,139,255,0.18),rgba(99,32,232,0.24))] text-[var(--c-text)] shadow-[0_12px_30px_rgba(0,0,0,0.2)]"
            : "border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] text-[var(--c-text-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-text)]",
        ].join(" ")}
        aria-label={settingsOpen ? "Close player hub" : "Open player hub"}
        title="Player Hub"
        aria-pressed={settingsOpen}
      >
        <Settings2 className="h-4.5 w-4.5" />
      </button>
    </aside>
  );
}
