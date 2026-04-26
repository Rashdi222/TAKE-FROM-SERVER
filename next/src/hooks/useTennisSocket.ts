"use client";

import { useEffect, useMemo, useState } from "react";
import type { TennisMatchState } from "@/lib/api";

type LiveConnectionStatus = "connecting" | "joined" | "error" | "closed";
type TennisEnvelope = [string | null, string | null, string, string, unknown];

function getSocketUrl() {
  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    (typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:4000`
      : "http://127.0.0.1:4000");

  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/socket/websocket";
  url.search = "vsn=2.0.0";
  return url.toString();
}

function connectTennisLobbyChannel(
  topic: string,
  handlers: {
  onStatus?: (status: LiveConnectionStatus) => void;
  onStateUpdated?: (payload: TennisMatchState) => void;
}) {
  let socket: WebSocket | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closedByCaller = false;
  let refCounter = 1;

  const nextRef = () => String(refCounter++);

  const connect = () => {
    handlers.onStatus?.("connecting");
    socket = new WebSocket(getSocketUrl());
    const joinRef = nextRef();

    socket.onopen = () => {
      socket?.send(JSON.stringify([joinRef, nextRef(), topic, "phx_join", {}] satisfies TennisEnvelope));
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify([null, nextRef(), "phoenix", "heartbeat", {}] satisfies TennisEnvelope));
        }
      }, 25_000);
    };

    socket.onmessage = (message) => {
      let parsed: TennisEnvelope | null = null;
      try {
        parsed = JSON.parse(message.data as string) as TennisEnvelope;
      } catch {
        return;
      }

      if (!Array.isArray(parsed) || parsed.length < 5) return;
      const [, , incomingTopic, event, payload] = parsed;
      if (incomingTopic !== topic && incomingTopic !== "phoenix") return;

      if (event === "phx_reply") {
        const status = (payload as { status?: string } | null)?.status;
        if (status === "ok") handlers.onStatus?.("joined");
        return;
      }

      if (event === "tennis_state_updated") {
        handlers.onStateUpdated?.((payload ?? {}) as TennisMatchState);
      }
    };

    socket.onerror = () => handlers.onStatus?.("error");
    socket.onclose = () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;

      if (!closedByCaller) {
        handlers.onStatus?.("closed");
        reconnectTimer = setTimeout(connect, 1200);
      }
    };
  };

  connect();

  return () => {
    closedByCaller = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (heartbeat) clearInterval(heartbeat);
    if (socket?.readyState === WebSocket.OPEN) {
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

export function useTennisSocket(initialMatches: TennisMatchState[], opts?: { allowNewKeys?: boolean }) {
  return useTennisSocketTopic(initialMatches, "tennis:lobby", opts);
}

export function useTennisMatchSocket(initialMatch: TennisMatchState | null, eventKey: string) {
  const initial = initialMatch ? [initialMatch] : [];
  const { matches, status } = useTennisSocketTopic(initial, `tennis:match:${eventKey}`, { allowNewKeys: true });
  return { match: matches[0] ?? initialMatch, status };
}

function useTennisSocketTopic(initialMatches: TennisMatchState[], topic: string, opts?: { allowNewKeys?: boolean }) {
  const [status, setStatus] = useState<LiveConnectionStatus>("connecting");
  const [socketMatches, setSocketMatches] = useState<Record<string, TennisMatchState>>({});

  useEffect(() => {
    return connectTennisLobbyChannel(topic, {
      onStatus: setStatus,
      onStateUpdated: (payload) => {
        if (!payload?.event_key) return;
        setSocketMatches((current) => ({ ...current, [payload.event_key]: payload }));
      },
    });
  }, [topic]);

  const matches = useMemo(() => {
    const baseMatches = Object.fromEntries(initialMatches.map((match) => [match.event_key, match]));
    const allowedKeys = new Set(initialMatches.map((match) => match.event_key));
    const filteredSocketMatches = opts?.allowNewKeys
      ? socketMatches
      : Object.fromEntries(
          Object.entries(socketMatches).filter(([eventKey]) => allowedKeys.has(eventKey)),
        );
    const merged = { ...baseMatches, ...filteredSocketMatches };
    return Object.values(merged);
  }, [initialMatches, socketMatches, opts?.allowNewKeys]);

  return { matches, status };
}
