import { Coins, Swords } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { CricketLineupContext } from "@/lib/cricket/cricketContext";

export function CricketTossCard({ context }: { context: CricketLineupContext | null | undefined }) {
  const toss = context?.toss;
  const hasToss = Boolean(toss?.winner_name || toss?.decision);

  return (
    <Card
      variant="surface-1"
      className="border-white/10 bg-[linear-gradient(135deg,rgba(28,56,44,0.76),rgba(10,16,21,0.9))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-2.5 text-emerald-200">
          <Coins className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">Toss</div>
          <div className="mt-1 text-xl font-semibold tracking-[-0.04em] text-white">
            {hasToss ? "Match edge established" : "Awaiting toss"}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[1.2rem] border border-white/8 bg-white/[0.04] p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-emerald-200">
            <Swords className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">
              {toss?.winner_name ? `${toss.winner_name} won the toss` : "Toss result not published yet"}
            </div>
            <div className="mt-2 text-sm leading-6 text-white/68">
              {toss?.decision
                ? `Decision: ${formatDecision(toss.decision)}`
                : "Once the toss is official, the batting or bowling decision will appear here instantly."}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function formatDecision(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "bat") return "Bat first";
  if (normalized === "bowl" || normalized === "field") return "Bowl first";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
