import type { Match } from "@/lib/api";

function toLower(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nonLiveHoldStatus(match: Match) {
  const top = toLower(match.status);
  const raw = match.raw_data;
  const values: string[] = [top];

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const data = raw as Record<string, unknown>;
    values.push(toLower(data.match_status), toLower(data.status));

    const fixture = data.fixture;
    if (fixture && typeof fixture === "object" && !Array.isArray(fixture)) {
      const status = (fixture as Record<string, unknown>).status;
      if (status && typeof status === "object" && !Array.isArray(status)) {
        const s = status as Record<string, unknown>;
        values.push(toLower(s.short), toLower(s.long), toLower(s.description), toLower(s.state));
      }
    }
  }

  const joined = values.filter(Boolean).join(" ");

  if (/\b(pst|postpon|postponed)\b/.test(joined)) return true;
  if (/\b(canc|cancel|cancelled)\b/.test(joined)) return true;
  if (/\b(abd|abandon|abandoned)\b/.test(joined)) return true;
  if (/\b(awd|awarded|technical loss|walkover|wo)\b/.test(joined)) return true;
  if (/\b(susp|suspended|interrupted|int|delayed)\b/.test(joined)) return true;
  return false;
}

export function hasExplicitNonLiveHoldStatus(match: Match) {
  return nonLiveHoldStatus(match);
}

function kickoffWindowLive(match: Match) {
  if (nonLiveHoldStatus(match)) return false;

  const status = toLower(match.status);
  if (!["upcoming", "scheduled"].includes(status)) return false;

  const rawStart = match.start_time;
  if (!rawStart) return false;

  const startMs = new Date(String(rawStart)).getTime();
  if (!Number.isFinite(startMs)) return false;

  const nowMs = Date.now();
  if (startMs > nowMs) return false;

  const maxDriftMs = 2 * 60 * 60 * 1000;
  return nowMs - startMs <= maxDriftMs;
}

function hasCricketLiveSignals(match: Match) {
  const overText = typeof match.current_over === "string" ? match.current_over.trim() : "";
  if (overText && overText !== "0" && overText !== "0.0") return true;
  if (positiveNumber(match.runs_total)) return true;
  if (positiveNumber(match.wickets_total)) return true;
  return false;
}

function hasFootballLiveSignals(match: Match) {
  if (positiveNumber(match.elapsed_minute)) return true;
  if (positiveNumber(match.home_score) || positiveNumber(match.away_score)) return true;
  if (positiveNumber(match.home_red_cards) || positiveNumber(match.away_red_cards)) return true;
  if (positiveNumber(match.home_corners) || positiveNumber(match.away_corners)) return true;
  if (positiveNumber(match.home_shots_on_target) || positiveNumber(match.away_shots_on_target)) return true;
  return false;
}

function hasRawLiveSignals(match: Match) {
  const raw = match.raw_data;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;

  const data = raw as Record<string, unknown>;
  const matchStatus = toLower(data.match_status);
  if (matchStatus.includes("live") || matchStatus.includes("in play") || matchStatus.includes("innings")) {
    return true;
  }

  const fixture = data.fixture;
  if (fixture && typeof fixture === "object" && !Array.isArray(fixture)) {
    const status = (fixture as Record<string, unknown>).status;
    if (status && typeof status === "object" && !Array.isArray(status)) {
      const short = toLower((status as Record<string, unknown>).short);
      const long = toLower((status as Record<string, unknown>).long);
      if (["1h", "2h", "et", "bt", "p", "ht"].includes(short)) return true;
      if (long.includes("live") || long.includes("in play") || long.includes("inning")) return true;
    }
  }

  return false;
}

export function hasLiveSignals(match: Match) {
  if (nonLiveHoldStatus(match)) return false;
  if (toLower(match.status) === "live") return true;
  if (Boolean(match.in_play_enabled)) return true;
  if (hasCricketLiveSignals(match)) return true;
  if (hasFootballLiveSignals(match)) return true;
  if (hasRawLiveSignals(match)) return true;
  if (kickoffWindowLive(match)) return true;
  return false;
}

export function isMatchLiveForDisplay(match: Match) {
  return hasLiveSignals(match);
}
