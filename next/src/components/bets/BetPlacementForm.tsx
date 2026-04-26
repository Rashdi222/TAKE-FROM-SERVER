"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateBet } from "@/hooks/useBets";
import { useBalance } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";

interface BetPlacementFormProps {
  matchId: string;
  oddsId: string;
  oddsValue: number | string;
  onSuccess?: () => void;
}

export function BetPlacementForm({ matchId, oddsId, oddsValue, onSuccess }: BetPlacementFormProps) {
  const router = useRouter();
  const [stake, setStake] = useState("");
  const createBet = useCreateBet();
  const { data: balanceData } = useBalance();

  const normalizedOddsValue = Number(oddsValue ?? 0);
  const stakeNum = Number(stake);
  const balance = balanceData?.balance ?? 0;
  const currency = String(balanceData?.account_currency ?? "USD");
  const potentialWin = stakeNum * normalizedOddsValue;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await createBet.mutateAsync({
        match_id: matchId,
        odds_id: oddsId,
        stake: stakeNum,
      });
      onSuccess?.();
      router.push("/bets");
      router.refresh();
    } catch {
      // Error handled by mutation state
    }
  };

  const isValid = stakeNum >= 100 && stakeNum <= balance;

  return (
    <Card variant="surface-2" className="p-6">
      <h3 className="text-xl font-semibold text-[var(--c-text)] mb-4">Place Your Bet</h3>
      
      {createBet.isError && (
        <Alert variant="error" className="mb-4">
          Failed to place bet. Please try again.
        </Alert>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-3">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--c-text-muted)]">Available Balance</span>
            <span className="font-mono font-bold text-[var(--c-text)]">{formatCurrency(balance, currency)}</span>
          </div>
        </div>

        <div className="p-3 rounded-[var(--r-sm)] bg-[var(--c-surface-1)] border border-[var(--c-border)]">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--c-text-muted)]">Odds</span>
              <span className="font-mono font-bold text-[var(--c-accent)]">{normalizedOddsValue}</span>
            </div>
          </div>
        
        <Input
          label="Stake Amount"
          type="number"
          min="100"
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          required
          placeholder={`Minimum 100 ${currency}`}
        />
        
        {stake && (
          <div className="p-3 rounded-[var(--r-sm)] bg-[var(--c-surface-1)] border border-[var(--c-border)]">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--c-text-muted)]">Potential Win</span>
              <span className="font-mono font-bold text-[var(--c-success)]">
                {formatCurrency(potentialWin, currency)}
              </span>
            </div>
          </div>
        )}
        
        {stake && stakeNum > balance && (
          <Alert variant="warning">Insufficient balance</Alert>
        )}

        {stake && stakeNum > 0 && stakeNum <= balance ? (
          <Alert variant="info">
            Stake {formatCurrency(stakeNum, currency)} to return {formatCurrency(potentialWin, currency)} if the selection wins.
          </Alert>
        ) : null}
        
        <Button 
          type="submit" 
          variant="primary" 
          className="w-full" 
          disabled={createBet.isPending || !isValid}
        >
          {createBet.isPending ? "Placing Bet..." : "Place Bet"}
        </Button>
      </form>
    </Card>
  );
}
