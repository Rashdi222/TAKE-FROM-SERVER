"use client";

import { useState } from "react";
import { Odds } from "@/lib/api";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { BetPlacementForm } from "./BetPlacementForm";
import { formatDecimal } from "@/lib/format";

interface BetSlipProps {
  isOpen: boolean;
  onClose: () => void;
  odds: Odds | null;
}

export function BetSlip({ isOpen, onClose, odds }: BetSlipProps) {
  const [placed, setPlaced] = useState(false);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] w-full overflow-y-auto rounded-t-[28px] border border-[var(--c-border)] bg-[var(--c-surface-1)] shadow-[var(--shadow-2)] md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:max-w-md md:rounded-none md:border-l md:border-t-0">
        <div className="mx-auto mt-3 h-1.5 w-14 rounded-full bg-[rgba(255,255,255,0.16)] md:hidden" />
        <div className="p-5 md:p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-[var(--c-text)]">Bet Slip</h2>
            <Button variant="secondary" onClick={onClose} className="text-sm px-3 py-1">
              Close
            </Button>
          </div>

          {odds ? (
            <Card variant="surface-1" className="mb-5 p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Selection</div>
              <div className="mt-2 text-sm font-semibold text-[var(--c-text)]">{String(odds.outcome ?? "Selection")}</div>
              <div className="mt-1 text-xs text-[var(--c-text-muted)]">
                {String(odds.bet_type ?? "market")} · Odds {formatDecimal(odds.odds_value)}
              </div>
            </Card>
          ) : null}

          {placed ? (
            <Card variant="surface-2" className="p-6 text-center">
              <p className="text-[var(--c-success)] mb-4">Bet placed successfully!</p>
              <Button variant="primary" onClick={() => { setPlaced(false); onClose(); }}>
                Place Another
              </Button>
            </Card>
          ) : odds ? (
            <BetPlacementForm
              matchId={odds.match_id || ""}
              oddsId={odds.id}
              oddsValue={odds.odds_value ?? 0}
              onSuccess={() => setPlaced(true)}
            />
          ) : (
            <p className="text-[var(--c-text-muted)]">Select an odd to place a bet</p>
          )}
        </div>
      </div>
    </>
  );
}
