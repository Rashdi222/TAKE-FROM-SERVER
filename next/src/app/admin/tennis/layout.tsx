import type { ReactNode } from "react";
import { TennisAdminSubnav } from "@/components/tennis/TennisAdminSubnav";

export default function AdminTennisLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_40%),linear-gradient(180deg,#07131e_0%,#050b12_100%)] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.35)]">
        <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/70">Tennis Admin</p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">Tennis Operations Desk</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/65">
              Manage tennis in three steps: choose fixtures, confirm live ingestion, then control published margin-shaved prices.
            </p>
          </div>
          <TennisAdminSubnav />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/65">1. Fixtures</div>
            <div className="mt-2 text-sm text-white">Choose matches to ingest</div>
            <div className="mt-1 text-xs leading-6 text-white/55">
              Start backend tracking from the fixture list instead of waiting for a live feed to appear by itself.
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/65">2. Live</div>
            <div className="mt-2 text-sm text-white">Verify score and socket flow</div>
            <div className="mt-1 text-xs leading-6 text-white/55">
              Confirm the worker is ingesting sets, games, serve state, and point pressure before relying on published markets.
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/65">3. Desk</div>
            <div className="mt-2 text-sm text-white">Control public pricing</div>
            <div className="mt-1 text-xs leading-6 text-white/55">
              Apply the global margin, inspect which tracked matches have publishable markets, and run simulations safely.
            </div>
          </div>
        </div>
      </section>
      {children}
    </div>
  );
}
