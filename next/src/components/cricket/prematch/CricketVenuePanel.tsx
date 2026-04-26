import type { ReactNode } from "react";
import { Building2, Shield, Trophy } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { CricketVenueContext } from "@/lib/cricket/cricketContext";

export function CricketVenuePanel({ context }: { context: CricketVenueContext | null | undefined }) {
  const venue = context?.venue;
  const officials = context?.officials;
  const awards = context?.awards;

  const officialNames = [
    officials?.first_umpire?.fullname,
    officials?.second_umpire?.fullname,
    officials?.tv_umpire?.fullname,
  ].filter(Boolean) as string[];

  return (
    <Card
      variant="surface-1"
      className="border-white/10 bg-[linear-gradient(135deg,rgba(26,42,74,0.78),rgba(8,12,24,0.88))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-2.5 text-cyan-200">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">Venue Intel</div>
          <div className="mt-1 text-xl font-semibold tracking-[-0.04em] text-white">
            {venue?.name || "Venue awaiting confirmation"}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <VenueStat label="City" value={[venue?.city, venue?.country].filter(Boolean).join(", ") || "To be confirmed"} />
        <VenueStat label="Referee" value={officials?.referee?.fullname || "Awaiting assignment"} icon={<Shield className="h-4 w-4" />} />
        <VenueStat label="On-field umpires" value={officialNames.join(" · ") || "Officials not published yet"} />
        <VenueStat label="Last honours" value={awards?.man_of_match?.fullname || awards?.man_of_series?.fullname || "No awards context yet"} icon={<Trophy className="h-4 w-4" />} />
      </div>
    </Card>
  );
}

function VenueStat({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.04] px-4 py-3 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">
        {icon ? <span className="text-cyan-200/80">{icon}</span> : null}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-sm font-medium leading-6 text-white/88">{value}</div>
    </div>
  );
}
