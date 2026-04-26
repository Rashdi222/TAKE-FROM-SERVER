"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { ApiError, isApiError, userApi, type Odds } from "@/lib/api";
import type { LiveMatchStore } from "@/lib/live/matchLiveStore";
import { useLiveMatchStoreSelector } from "@/lib/live/matchLiveStore";
import type { LiveMatchSelectionQuote } from "@/lib/live/types";
import { shouldUseCanonicalLiveTrading } from "@/lib/live/flags";
import { formatFootballMarketLabel, formatFootballSelectionLabel } from "@/lib/football/footballMarketDictionary";
import { formatCurrency, formatDecimal, toNumber } from "@/lib/format";
import { useBalance } from "@/hooks/useProfile";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type LiveFootballBetSlipProps = {
  store: LiveMatchStore;
  quote: LiveMatchSelectionQuote | null;
  onClose: () => void;
};

type QuoteState = LiveMatchSelectionQuote & { warning?: string | null };
type CanonicalOddsState = {
  price: number | null;
  status: "active" | "suspended" | "closed";
  isSuspended: boolean;
};

function latestQuoteFromOdds(odds: Odds | undefined, stateVersion: number): LiveMatchSelectionQuote | null {
  if (!odds) return null;
  const price = toNumber(odds.odds_value);
  if (price === null) return null;

  return {
    oddsId: odds.id,
    matchId: String(odds.match_id || ""),
    marketKey: String(odds.source_market_key || odds.bet_type || odds.market || "market"),
    selectionKey: String(odds.selection_key || odds.outcome || odds.id),
    label: String(odds.outcome || odds.selection_key || "Selection"),
    quotedPrice: price,
    oddsVersionNo: Number(odds.version_no || 0),
    stateVersion,
  };
}

function latestQuoteFromCanonical(
  canonicalOdds: Record<string, CanonicalOddsState>,
  quote: LiveMatchSelectionQuote | null,
  latestOdds: Odds | undefined,
  stateVersion: number,
): LiveMatchSelectionQuote | null {
  if (!quote && !latestOdds) return null;

  const marketKey = String(
    quote?.marketKey || latestOdds?.source_market_key || latestOdds?.bet_type || latestOdds?.market || "market",
  );
  const selectionKey = String(
    quote?.selectionKey || latestOdds?.selection_key || latestOdds?.outcome || latestOdds?.id || "selection",
  );
  const canonical = canonicalOdds[`${marketKey}::${selectionKey}`];

  if (!canonical || canonical.price == null) return null;

  return {
    oddsId: String(quote?.oddsId || latestOdds?.id || ""),
    matchId: String(quote?.matchId || latestOdds?.match_id || ""),
    marketKey,
    selectionKey,
    label: String(quote?.label || latestOdds?.outcome || latestOdds?.selection_key || "Selection"),
    quotedPrice: canonical.price,
    oddsVersionNo: Number(latestOdds?.version_no || quote?.oddsVersionNo || 0),
    stateVersion,
  };
}

function normalizeQuoteKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, "_");
}

function selectionAliases(value: string | null | undefined) {
  const normalized = normalizeQuoteKey(value);
  if (!normalized) return new Set<string>();
  if (normalized === "home" || normalized === "team1" || normalized === "1") {
    return new Set(["home", "team1", "1"]);
  }
  if (normalized === "away" || normalized === "team2" || normalized === "2") {
    return new Set(["away", "team2", "2"]);
  }
  if (normalized === "draw" || normalized === "x" || normalized === "tie") {
    return new Set(["draw", "x", "tie"]);
  }
  if (normalized === "yes" || normalized === "y") {
    return new Set(["yes", "y"]);
  }
  if (normalized === "no" || normalized === "n") {
    return new Set(["no", "n"]);
  }
  return new Set([normalized]);
}

function oddsSelectionTokens(odds: Odds) {
  const tokens = new Set<string>();
  const values = [odds.selection_key, odds.outcome, odds.id];

  for (const value of values) {
    const aliases = selectionAliases(String(value || ""));
    for (const alias of aliases) tokens.add(alias);
  }

  return tokens;
}

function findReplacementQuote(
  oddsById: Record<string, Odds>,
  quote: LiveMatchSelectionQuote | null,
  stateVersion: number,
): LiveMatchSelectionQuote | null {
  if (!quote) return null;

  const targetMarketKey = normalizeQuoteKey(quote.marketKey);
  const targetSelectionAliases = selectionAliases(quote.selectionKey);

  const candidates = Object.values(oddsById)
    .filter((odds) => {
      if (odds.visibility_status !== "published") return false;
      if (odds.is_active === false || odds.is_suspended === true) return false;

      const marketKey = normalizeQuoteKey(String(odds.source_market_key || odds.bet_type || odds.market || "market"));
      if (marketKey !== targetMarketKey) return false;

      const candidateTokens = oddsSelectionTokens(odds);
      for (const alias of targetSelectionAliases) {
        if (candidateTokens.has(alias)) return true;
      }
      return false;
    })
    .sort((a, b) => {
      const platformDelta = Number(a.source_type === "platform") - Number(b.source_type === "platform");
      if (platformDelta !== 0) return -platformDelta;
      return Number(b.version_no || 0) - Number(a.version_no || 0);
    });

  return latestQuoteFromOdds(candidates[0], stateVersion);
}

function resolveFootballBetSlipSuspensionMessage(reason: string | null | undefined): string {
  const r = (reason || "").trim().toLowerCase();
  if (!r || r === "repricing" || r === "live_reprice") return "Prices are updating. Your bet will be available in a moment.";
  if (r === "goal_scored") return "Goal scored — market paused briefly while prices update.";
  if (r === "var_review" || r === "penalty_review") return "VAR/Penalty review in progress. Betting resumes after the decision.";
  if (r === "red_card") return "Red card — market paused briefly while prices update.";
  if (r === "half_time" || r === "half_time_break") return "Half time. Betting resumes for the second half.";
  if (r === "provider_disconnect" || r === "provider_import_failure") return "Live feed reconnecting. Betting resumes shortly.";
  if (r === "manual_admin_review") return "Market paused for review. Betting resumes shortly.";
  return "This market is temporarily paused while live prices refresh.";
}

function userFacingBetError(message: string | null | undefined) {
  const normalized = String(message || "").trim().toLowerCase();

  if (normalized === "stale quote") {
    return "This live price just changed. Please accept the new quote.";
  }

  if (normalized === "market suspended") {
    return "This market is temporarily paused while live prices update.";
  }

  if (normalized === "live price unavailable" || normalized === "odds_not_available" || normalized === ":odds_not_available") {
    return "This live price just changed. Please accept the latest available quote.";
  }

  return message || "Unable to place football bet right now.";
}

function isWithinQuoteTolerance(
  original: LiveMatchSelectionQuote | null,
  latest: LiveMatchSelectionQuote | null,
) {
  if (!original || !latest) return false;
  return latest.quotedPrice >= original.quotedPrice * 0.98;
}

export function LiveFootballBetSlip({ store, quote, onClose }: LiveFootballBetSlipProps) {
  const queryClient = useQueryClient();
  const latestOdds = useLiveMatchStoreSelector(store, (state) => (quote ? state.oddsById[quote.oddsId] : undefined));
  const oddsById = useLiveMatchStoreSelector(store, (state) => state.oddsById);
  const canonicalOdds = useLiveMatchStoreSelector(store, (state) => state.canonicalOdds);
  const match = useLiveMatchStoreSelector(store, (state) => state.match);
  const stateVersion = useLiveMatchStoreSelector(store, (state) => state.lastStateVersion);
  const suspended = useLiveMatchStoreSelector(store, (state) => state.marketSuspended);
  const suspensionReason = useLiveMatchStoreSelector(store, (state) => state.suspensionReason);
  const suspendedMarkets = useLiveMatchStoreSelector(store, (state) => state.suspendedMarkets);
  const dataHealth = useLiveMatchStoreSelector(store, (state) => state.dataHealth);
  const { data: balanceData } = useBalance();
  const [stake, setStake] = useState("");
  const [quoteOverride, setQuoteOverride] = useState<QuoteState | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);
  const [acceptedQuote, setAcceptedQuote] = useState<LiveMatchSelectionQuote | null>(null);

  const createBet = useMutation({
    mutationFn: async (payload: LiveMatchSelectionQuote & { stake: number }) => {
      return userApi.bets.create({
        match_id: payload.matchId,
        odds_id: payload.oddsId,
        stake: payload.stake,
        in_play: true,
        match_state_version: payload.stateVersion,
        odds_version_no: payload.oddsVersionNo,
        market_key: payload.marketKey,
        selection_key: payload.selectionKey,
        quoted_odds_value: payload.quotedPrice,
        client_snapshot: {
          source: "live_football_bet_slip",
          accepted_at: new Date().toISOString(),
        },
      });
    },
    onSuccess: (_response, variables) => {
      setPlaced(true);
      setWarning(null);
      setAcceptedQuote(variables);
      queryClient.invalidateQueries({ queryKey: ["user", "balance"] });
      queryClient.invalidateQueries({ queryKey: ["user", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["bets"] });
    },
  });

  const canonicalMode = shouldUseCanonicalLiveTrading(match);

  const latestResolvedQuote = useMemo(() => {
    if (!quote) return null;
    return (
      (canonicalMode
        ? latestQuoteFromCanonical(canonicalOdds, quote, latestOdds, stateVersion)
        : null) ||
      latestQuoteFromOdds(latestOdds, stateVersion) ||
      findReplacementQuote(oddsById, quote, stateVersion) ||
      quote
    );
  }, [quote, latestOdds, oddsById, stateVersion, canonicalMode, canonicalOdds]);

  const requiresPriceAcceptance =
    Boolean(quote && latestResolvedQuote) && !isWithinQuoteTolerance(quote, latestResolvedQuote);
  const activeQuote = quoteOverride || latestResolvedQuote || quote;
  const marketSuspension = activeQuote ? suspendedMarkets[activeQuote.marketKey] : undefined;
  const rowSuspended = latestOdds?.is_suspended === true || latestOdds?.is_active === false;
  const slipSuspended = dataHealth.degraded || rowSuspended || Boolean(marketSuspension) || (suspended && !latestOdds);
  const effectiveSuspensionReason =
    (typeof latestOdds?.suspension_reason === "string" && latestOdds.suspension_reason) ||
    marketSuspension?.reason ||
    suspensionReason;
  const liveQuoteDrift =
    Boolean(quote && latestResolvedQuote) &&
    (latestResolvedQuote?.quotedPrice !== quote?.quotedPrice ||
      latestResolvedQuote?.oddsVersionNo !== quote?.oddsVersionNo ||
      latestResolvedQuote?.stateVersion !== quote?.stateVersion);

  const balance = Number(balanceData?.balance || 0);
  const currency = String(balanceData?.account_currency || "USD");
  const stakeValue = Number(stake || 0);
  const potentialReturn = activeQuote ? stakeValue * activeQuote.quotedPrice : 0;
  const isOpen = Boolean(activeQuote);
  const isValidStake = stakeValue >= 100 && stakeValue <= balance;
  if (!isOpen || !activeQuote) return null;

  const handleSubmit = async () => {
    if (!activeQuote || slipSuspended || !isValidStake) return;

    try {
      await createBet.mutateAsync({ ...activeQuote, stake: stakeValue });
    } catch (error) {
      if (isApiError(error)) {
        const latest = latestResolvedQuote;
        const normalizedMessage = String(error.message || "").trim().toLowerCase();

        if ((normalizedMessage === "stale quote" || normalizedMessage === "live price unavailable") && latest) {
          if (isWithinQuoteTolerance(activeQuote, latest)) {
            await createBet.mutateAsync({ ...latest, stake: stakeValue });
            return;
          }

          setQuoteOverride({ ...latest, warning: "This live price just changed. Please accept the new quote." });
          setWarning("This live price just changed. Please accept the new quote.");
          return;
        }

        if (normalizedMessage === "market suspended") {
          setWarning("This market is temporarily paused while live prices update.");
          return;
        }

        if (error.status === 401) {
          setWarning("Log in again to place a live football bet.");
          return;
        }

        setWarning(userFacingBetError(error.message));
        return;
      }

      if (error instanceof ApiError) {
        setWarning(userFacingBetError(error.message));
        return;
      }

      setWarning("Unable to place football bet right now.");
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto overscroll-contain rounded-t-[28px] border border-[var(--c-border)] bg-[var(--c-surface-1)] shadow-[var(--shadow-2)] lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[380px] lg:rounded-none lg:border-l lg:border-t-0">
        <div className="mx-auto mt-3 h-1.5 w-14 rounded-full bg-[rgba(255,255,255,0.16)] lg:hidden" />
        <div className="space-y-4 p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:p-5 lg:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--c-text-faint)]">Live Football Slip</div>
              <div className="mt-1 text-xl font-semibold text-[var(--c-text)]">
                {formatFootballSelectionLabel(activeQuote.label, {
                  marketKey: activeQuote.marketKey,
                  team1: String(match.team1 || ""),
                  team2: String(match.team2 || ""),
                })}
              </div>
            </div>
            <Button variant="secondary" onClick={onClose} className="min-h-11 px-3 py-2 text-sm">
              Close
            </Button>
          </div>

          <Card variant="surface-1" className="p-4">
            <div className="flex items-center justify-between text-sm text-[var(--c-text-muted)]">
              <span>Quoted Price</span>
              <span className="font-mono text-xl font-bold text-[var(--c-accent)]">{formatDecimal(activeQuote.quotedPrice)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
              <span>state {activeQuote.stateVersion}</span>
              <span>version {activeQuote.oddsVersionNo}</span>
              <span>
                {formatFootballMarketLabel(activeQuote.marketKey, {
                  selections: [activeQuote.label],
                })}
              </span>
            </div>
          </Card>

          {requiresPriceAcceptance && quote && latestResolvedQuote ? (
            <Card variant="surface-1" className="border-amber-500/25 bg-amber-500/6 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">Price Update</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/8 bg-white/5 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Selected</div>
                  <div className="mt-1 font-mono text-xl font-bold text-[var(--c-text)]">{formatDecimal(quote.quotedPrice)}</div>
                </div>
                <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200">Latest</div>
                  <div className="mt-1 font-mono text-xl font-bold text-amber-100">{formatDecimal(latestResolvedQuote.quotedPrice)}</div>
                </div>
              </div>
            </Card>
          ) : null}

          {dataHealth.degraded ? (
            <Card variant="surface-1" className="border-amber-500/25 bg-amber-500/6 p-4 text-sm text-amber-100">
              {dataHealth.warning || "Live feed interrupted - reconnecting..."}
            </Card>
          ) : null}

          <Card variant="surface-1" className="p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--c-text-muted)]">Available Balance</span>
              <span className="font-mono font-bold text-[var(--c-text)]">{formatCurrency(balance, currency)}</span>
            </div>
            <label className="mt-4 block text-sm font-medium text-[var(--c-text)]">
              Stake
              <input
                type="number"
                min="100"
                inputMode="decimal"
                enterKeyHint="done"
                value={stake}
                onChange={(event) => setStake(event.target.value)}
                className="mt-2 w-full rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-2)] px-4 py-3 text-[var(--c-text)] outline-none transition-colors focus:border-[var(--c-accent)]"
                placeholder={`Minimum 100 ${currency}`}
              />
            </label>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-[var(--c-text-muted)]">Potential Return</span>
              <span className="font-mono font-bold text-emerald-300">{formatCurrency(potentialReturn, currency)}</span>
            </div>
          </Card>

          {slipSuspended ? (
            <WarningCard
              message={resolveFootballBetSlipSuspensionMessage(effectiveSuspensionReason)}
            />
          ) : null}
          {liveQuoteDrift && requiresPriceAcceptance ? (
            <WarningCard message="Odds have changed beyond the live acceptance buffer. Please accept the new quote." />
          ) : null}
          {liveQuoteDrift && !requiresPriceAcceptance ? (
            <WarningCard message="Live price refreshed to the latest provider quote." />
          ) : null}
          {warning ? <WarningCard message={warning} /> : null}
          {placed ? (
            <Card variant="surface-2" className="p-5 text-center">
              <div className="text-lg font-semibold text-emerald-300">Bet placed</div>
              <p className="mt-2 text-sm text-[var(--c-text-muted)]">The live football quote was accepted and submitted successfully.</p>
              {acceptedQuote && quote && acceptedQuote.oddsId !== quote.oddsId ? (
                <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-left">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">Accepted Price</div>
                  <div className="mt-1 font-mono text-lg font-bold text-emerald-100">{formatDecimal(acceptedQuote.quotedPrice)}</div>
                </div>
              ) : null}
              <div className="mt-4">
                <Button variant="primary" onClick={onClose}>Done</Button>
              </div>
            </Card>
          ) : null}

          <div className="sticky bottom-0 -mx-4 border-t border-white/8 bg-[linear-gradient(180deg,rgba(20,18,38,0.72),rgba(20,18,38,0.96))] px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] backdrop-blur sm:-mx-5 sm:px-5 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:pb-0 lg:backdrop-blur-none">
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={createBet.isPending || slipSuspended || !isValidStake}
              className="min-h-12 w-full justify-center text-base"
            >
              {createBet.isPending ? (
                <span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Placing Live Bet</span>
              ) : requiresPriceAcceptance || warning?.toLowerCase().includes("please accept") ? (
                "Accept & Place Bet"
              ) : (
                "Place Bet"
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function WarningCard({ message }: { message: string }) {
  return (
    <Card variant="surface-1" className="border-amber-500/30 bg-amber-500/10 p-4 text-amber-100" role="alert" aria-live="polite">
      <div className="flex items-start gap-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>{message}</div>
      </div>
    </Card>
  );
}
