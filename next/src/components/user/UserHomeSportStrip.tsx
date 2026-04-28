"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Layers3 } from "lucide-react";
import { SPORTBOOK_SPORTS } from "@/components/user/sportsbook/sports";

export function UserHomeSportStrip() {
  const searchParams = useSearchParams();
  const selectedSport = searchParams.get("sport") || "cricket";

  return (
    <div className="sticky top-0 z-30 -mx-3 border-b border-[rgba(255,255,255,0.08)] bg-[rgba(8,10,18,0.88)] px-3 py-2 backdrop-blur-xl">
      <div className="overflow-x-auto scrollbar-none">
        <div className="flex w-max gap-2">
          <Link
            href="/sportsbook/home?sport=all"
            prefetch
            className={[
              "group relative flex h-14 w-24 shrink-0 flex-col items-start justify-end overflow-hidden rounded-2xl border p-2 transition-all will-change-transform [transform:perspective(900px)_translateZ(0)]",
              selectedSport === "all"
                ? "border-[rgba(161,121,241,0.5)] shadow-[0_10px_30px_rgba(99,32,232,0.26)]"
                : "border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.18)]",
              "active:scale-[0.98]",
            ].join(" ")}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(58,139,255,0.3),transparent_42%),linear-gradient(180deg,rgba(17,24,39,0.56),rgba(8,10,18,0.74))]" />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_45%)]" />
            <div className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-xl border border-[rgba(255,255,255,0.16)] bg-[rgba(10,8,20,0.62)] backdrop-blur">
              <Layers3 className={["h-3.5 w-3.5", selectedSport === "all" ? "text-white" : "text-white/70"].join(" ")} />
            </div>
            <span
              className={[
                "relative z-10 text-[11px] font-semibold tracking-[0.04em]",
                selectedSport === "all" ? "text-white" : "text-[rgba(255,255,255,0.75)]",
              ].join(" ")}
            >
              All
            </span>
            {selectedSport === "all" ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--c-accent)]" /> : null}
          </Link>
          {SPORTBOOK_SPORTS.map((sport) => {
            const active = selectedSport === sport.id;
            const Icon = sport.icon;

            return (
              <Link
                key={sport.id}
                href={`/sportsbook/home?sport=${sport.id}`}
                prefetch
                className={[
                  "group relative flex h-14 w-24 shrink-0 flex-col items-start justify-end overflow-hidden rounded-2xl border p-2 transition-all will-change-transform [transform:perspective(900px)_translateZ(0)]",
                  active
                    ? "border-[rgba(161,121,241,0.5)] shadow-[0_10px_30px_rgba(99,32,232,0.26)]"
                    : "border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.18)]",
                  "active:scale-[0.98]",
                ].join(" ")}
              >
                <Image
                  src={sport.image}
                  alt={sport.label}
                  fill
                  className="object-cover object-center opacity-40 transition-transform duration-300 group-hover:scale-[1.06]"
                  sizes="96px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(10,8,20,0.86)] via-[rgba(10,8,20,0.32)] to-transparent" />
                <div
                  className={[
                    "absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-xl border bg-[rgba(10,8,20,0.62)] backdrop-blur",
                    active ? "border-[rgba(161,121,241,0.45)]" : "border-[rgba(255,255,255,0.14)]",
                  ].join(" ")}
                >
                  <Icon className={["h-3.5 w-3.5", active ? "text-white" : "text-white/70"].join(" ")} />
                </div>
                <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <div className="absolute -left-10 -top-10 h-24 w-24 rounded-full bg-[rgba(255,255,255,0.10)] blur-2xl" />
                </div>
                <span
                  className={[
                    "relative z-10 text-[11px] font-semibold tracking-[0.04em]",
                    active ? "text-white" : "text-[rgba(255,255,255,0.75)]",
                  ].join(" ")}
                >
                  {sport.shortLabel}
                </span>
                {active ? (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--c-accent)]" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
