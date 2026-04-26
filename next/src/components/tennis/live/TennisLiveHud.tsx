"use client";

import { memo, useMemo } from "react";
import type { TennisMatchState } from "@/lib/api";
import { extractTennisContext } from "@/lib/tennis/tennisContext";
import { currentGameBlocks, extractLiveStats, extractRecentPoints, resolveServerSide } from "@/lib/tennis/liveData";
import { TennisLiveScorecard } from "./TennisLiveScorecard";
import { TennisLiveStats } from "./TennisLiveStats";
import { TennisPointTimeline } from "./TennisPointTimeline";

export const TennisLiveHud = memo(function TennisLiveHud({
  match,
}: {
  match: Pick<
    TennisMatchState,
    | "player_1_name"
    | "player_2_name"
    | "server"
    | "event_status"
    | "score"
    | "sets"
    | "point_by_point"
    | "current_game_score"
    | "break_point"
    | "set_point"
    | "match_point"
    | "tennis_context"
  >;
}) {
  const serverSide = useMemo(() => resolveServerSide(match.server), [match.server]);
  const context = useMemo(() => extractTennisContext(match as TennisMatchState), [match]);
  const recentPoints = useMemo(() => extractRecentPoints(match as TennisMatchState), [match]);
  const stats = useMemo(() => extractLiveStats(context), [context]);
  const game = useMemo(() => currentGameBlocks(match as TennisMatchState), [match]);
  const setRows = useMemo(
    () =>
      (Array.isArray(match.sets) ? match.sets : []).map((row) => ({
        set: row?.set as string | number | null | undefined,
        player_1: row?.player_1_games as string | number | null | undefined,
        player_2: row?.player_2_games as string | number | null | undefined,
      })),
    [match.sets],
  );

  return (
    <div className="grid gap-4">
      <TennisLiveScorecard
        player1Name={match.player_1_name || "Player 1"}
        player2Name={match.player_2_name || "Player 2"}
        serverSide={serverSide}
        statusLabel={match.event_status || "Live"}
        currentGame1={game.player1}
        currentGame2={game.player2}
        pointScore={`${game.player1} - ${game.player2}`}
        sets={setRows}
        breakPoint={Boolean(match.break_point)}
        setPoint={Boolean(match.set_point)}
        matchPoint={Boolean(match.match_point)}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <TennisPointTimeline points={recentPoints} />
        <TennisLiveStats stats={stats} />
      </div>
    </div>
  );
});
