import type {
  CanonicalMarketUpdatedPayload,
  CanonicalOddsUpdatedPayload,
  HealthDegradedPayload,
  LiveConnectionStatus,
  MarketResumedPayload,
  MarketSuspendedPayload,
  MatchStateUpdatePayload,
  OddsDelta,
} from "./types";
import { ENABLE_CANONICAL_LIVE_TRADING } from "./flags";

type Handlers = {
  onStatus?: (status: LiveConnectionStatus) => void;
  onJoined?: (context: { rejoined: boolean; attempts: number }) => void;
  onMatchStateUpdated?: (payload: MatchStateUpdatePayload) => void;
  onOddsUpdated?: (payload: OddsDelta) => void;
  onMarketSuspended?: (payload: MarketSuspendedPayload) => void;
  onMarketResumed?: (payload: MarketResumedPayload) => void;
  onCanonicalMarketUpdated?: (payload: CanonicalMarketUpdatedPayload) => void;
  onCanonicalOddsUpdated?: (payload: CanonicalOddsUpdatedPayload) => void;
  onHealthDegraded?: (payload: HealthDegradedPayload) => void;
};

type PhoenixEnvelope = [string | null, string | null, string, string, unknown];

function getSocketUrl() {
  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:4000` : "http://127.0.0.1:4000");

  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/socket/websocket";
  url.search = "vsn=2.0.0";
  return url.toString();
}

export function connectMatchChannel(matchId: string, handlers: Handlers) {
  const topic = `match:${matchId}`;
  let socket: WebSocket | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let joinTimeout: ReturnType<typeof setTimeout> | null = null;
  let closedByCaller = false;
  let refCounter = 1;
  let reconnectAttempt = 0;
  let joinedOnce = false;
  let latestMessageAt = Date.now();
  let staleWatchdog: ReturnType<typeof setInterval> | null = null;
  let lastResyncAt = 0;

  const nextRef = () => String(refCounter++);
  const maxReconnectDelayMs = 12_000;
  const baseReconnectDelayMs = 900;
  const joinTimeoutMs = 8_000;
  const staleThresholdMs = 120_000;
  const minResyncIntervalMs = 2_500;

  const send = (event: string, payload: unknown, joinRef: string | null = null) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const envelope: PhoenixEnvelope = [joinRef, nextRef(), topic, event, payload];
    socket.send(JSON.stringify(envelope));
  };

  const clearTimers = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (joinTimeout) {
      clearTimeout(joinTimeout);
      joinTimeout = null;
    }
    if (staleWatchdog) {
      clearInterval(staleWatchdog);
      staleWatchdog = null;
    }
  };

  const maybeNotifyResync = (rejoined: boolean) => {
    const now = Date.now();
    if (!rejoined && joinedOnce) return;
    if (now - lastResyncAt < minResyncIntervalMs) return;
    lastResyncAt = now;
    handlers.onJoined?.({ rejoined, attempts: reconnectAttempt });
  };

  const scheduleReconnect = () => {
    if (closedByCaller || reconnectTimer) return;
    handlers.onStatus?.("connecting");
    const delayMs = Math.min(maxReconnectDelayMs, baseReconnectDelayMs * 2 ** Math.max(0, reconnectAttempt));
    const jitterMs = Math.floor(Math.random() * 400);
    const waitMs = delayMs + jitterMs;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectAttempt += 1;
      connect();
    }, waitMs);
  };

  const connect = () => {
    handlers.onStatus?.("connecting");
    socket = new WebSocket(getSocketUrl());
    const joinRef = nextRef();
    latestMessageAt = Date.now();

    socket.onopen = () => {
      clearTimers();
      socket?.send(JSON.stringify([joinRef, nextRef(), topic, "phx_join", {}] satisfies PhoenixEnvelope));
      heartbeat = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify([null, nextRef(), "phoenix", "heartbeat", {}] satisfies PhoenixEnvelope));
        }
      }, 25_000);
      joinTimeout = setTimeout(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.close();
        }
      }, joinTimeoutMs);
      staleWatchdog = setInterval(() => {
        if (socket?.readyState !== WebSocket.OPEN) return;
        if (Date.now() - latestMessageAt > staleThresholdMs) {
          handlers.onStatus?.("closed");
          socket.close();
        }
      }, 15_000);
    };

    socket.onmessage = (message) => {
      let parsed: PhoenixEnvelope | null = null;
      try {
        parsed = JSON.parse(message.data as string) as PhoenixEnvelope;
      } catch {
        return;
      }

      if (!Array.isArray(parsed) || parsed.length < 5) return;
      const [, , incomingTopic, event, payload] = parsed;
      if (incomingTopic !== topic && incomingTopic !== "phoenix") return;
      latestMessageAt = Date.now();

      if (event === "phx_reply") {
        const status = (payload as { status?: string } | null)?.status;
        if (status === "ok") {
          if (joinTimeout) {
            clearTimeout(joinTimeout);
            joinTimeout = null;
          }
          const rejoined = joinedOnce;
          joinedOnce = true;
          reconnectAttempt = 0;
          handlers.onStatus?.("joined");
          maybeNotifyResync(rejoined);
        }
        return;
      }

      if (event === "phx_close" || event === "phx_error") {
        handlers.onStatus?.("error");
        return;
      }

      switch (event) {
        case "match_state_updated":
          handlers.onMatchStateUpdated?.((payload ?? {}) as MatchStateUpdatePayload);
          break;
        case "odds_updated":
          if (!ENABLE_CANONICAL_LIVE_TRADING) {
            handlers.onOddsUpdated?.((payload ?? { odds: [] }) as OddsDelta);
          }
          break;
        case "market_suspended":
          if (!ENABLE_CANONICAL_LIVE_TRADING) {
            handlers.onMarketSuspended?.((payload ?? {}) as MarketSuspendedPayload);
          }
          break;
        case "market_resumed":
          if (!ENABLE_CANONICAL_LIVE_TRADING) {
            handlers.onMarketResumed?.((payload ?? {}) as MarketResumedPayload);
          }
          break;
        case "canonical_market_updated":
          handlers.onCanonicalMarketUpdated?.((payload ?? {}) as CanonicalMarketUpdatedPayload);
          break;
        case "canonical_odds_updated":
          handlers.onCanonicalOddsUpdated?.((payload ?? { odds: [] }) as CanonicalOddsUpdatedPayload);
          break;
        case "health_degraded":
          handlers.onHealthDegraded?.((payload ?? {}) as HealthDegradedPayload);
          break;
        default:
          break;
      }
    };

    socket.onerror = () => {
      handlers.onStatus?.("error");
    };

    socket.onclose = () => {
      clearTimers();
      if (!closedByCaller) {
        handlers.onStatus?.("closed");
        scheduleReconnect();
      }
    };
  };

  connect();

  return () => {
    closedByCaller = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    clearTimers();
    if (socket && socket.readyState === WebSocket.OPEN) {
      send("phx_leave", {});
      socket.close();
      return;
    }

    if (socket?.readyState === WebSocket.CONNECTING) {
      socket.onopen = () => {
        socket?.close();
      };
      return;
    }

    socket?.close();
  };
}
