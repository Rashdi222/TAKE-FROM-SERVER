"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useGenerateOdds } from "@/hooks/useOdds";
import type { SportMarketConfig } from "@/lib/api";

const sportPresets: Record<string, string[]> = {
  cricket: ["match_winner", "over_under"],
  football: ["match_winner", "over_under"],
  tennis: ["match_winner"],
  horse_racing: ["match_winner"],
  dog_racing: ["match_winner"],
};

export function GenerateOddsButton({
  matchId,
  sport,
  marketConfigs = [],
}: {
  matchId: string;
  sport?: string;
  marketConfigs?: SportMarketConfig[];
}) {
  const generate = useGenerateOdds(matchId);
  const [open, setOpen] = useState(false);
  const [hardness, setHardness] = useState("medium");
  const [adminNote, setAdminNote] = useState("");

  const betTypeOptions = useMemo(() => {
    const enabled = marketConfigs.filter((item) => item.is_enabled).map((item) => item.bet_type);

    if (enabled.length > 0) {
      return Array.from(new Set(enabled));
    }

    return sport
      ? sportPresets[sport] || ["match_winner"]
      : ["match_winner", "over_under", "in_play"];
  }, [marketConfigs, sport]);

  const [betTypes, setBetTypes] = useState<string[]>([]);
  const selectedBetTypes = useMemo(() => {
    const valid = betTypes.filter((item) => betTypeOptions.includes(item));
    return valid.length > 0 ? valid : betTypeOptions;
  }, [betTypeOptions, betTypes]);
  const canSubmit = useMemo(() => selectedBetTypes.length > 0, [selectedBetTypes]);

  const toggleBetType = (betType: string) => {
    setBetTypes(() =>
      selectedBetTypes.includes(betType)
        ? selectedBetTypes.filter((item) => item !== betType)
        : [...selectedBetTypes, betType],
    );
  };

  const handleGenerate = async () => {
    const selectedTypes = selectedBetTypes;
    const selectedConfigs = marketConfigs.filter((item) => selectedTypes.includes(item.bet_type));
    const marketLimits = selectedConfigs.map((item) => ({
      bet_type: item.bet_type,
      max_stake_amount: item.default_max_stake_amount || undefined,
      max_payout_amount: item.default_max_payout_amount || undefined,
      limit_scope: "market",
    }));

    await generate.mutateAsync({
      hardness,
      admin_note: adminNote || undefined,
      bet_types: selectedTypes,
      default_max_stake_amount: selectedConfigs[0]?.default_max_stake_amount || undefined,
      default_max_payout_amount: selectedConfigs[0]?.default_max_payout_amount || undefined,
      market_limits: marketLimits.length > 0 ? marketLimits : undefined,
    });
    setOpen(false);
  };

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Generate Odds
      </Button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Generate Odds">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--c-text)]">Bet Types</p>
            <div className="flex flex-wrap gap-2">
              {betTypeOptions.map((betType) => {
                const active = selectedBetTypes.includes(betType);

                return (
                  <button
                    key={betType}
                    type="button"
                    onClick={() => toggleBetType(betType)}
                    className={`rounded-[var(--r-pill)] border px-3 py-1 text-sm ${
                      active
                        ? "border-[var(--c-accent)] bg-[var(--c-accent-soft)] text-[var(--c-text)]"
                        : "border-[var(--c-border)] text-[var(--c-text-muted)]"
                    }`}
                  >
                    {betType}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--c-text)]">Hardness</label>
            <select
              value={hardness}
              onChange={(e) => setHardness(e.target.value)}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <Input
            label="Admin Note"
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Optional guidance for the generation pass"
          />

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={generate.isPending || !canSubmit}
            >
              {generate.isPending ? "Generating..." : "Generate"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
