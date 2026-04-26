from __future__ import annotations

from fastapi import FastAPI, HTTPException

from assistant import AssistantChatRequest, AssistantChatResponse, run_assistant_graph
from cricket.orchestrator import (
    CalculateOddsRequest,
    CalculateOddsResponse,
    observability_snapshot,
    run_graph,
)
from cricket.replay import CricketReplayRequest, CricketReplayResponse, run_replay
from cricket.source_refresh_policy import (
    SourceRefreshRequest,
    SourceRefreshResponse,
    calculate_source_refresh_policy,
)
from football.orchestrator import (
    CalculateFootballOddsRequest,
    CalculateFootballOddsResponse,
    run_football_graph,
)

app = FastAPI(title="Sixerbat AI Engine", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/calculate_odds", response_model=CalculateOddsResponse)
def calculate_odds(payload: CalculateOddsRequest) -> CalculateOddsResponse:
    try:
        return run_graph(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"invalid_payload:{exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"calculation_failed:{exc}") from exc


@app.get("/cricket/observability")
def cricket_observability() -> dict:
    try:
        return observability_snapshot()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"observability_failed:{exc}") from exc


@app.get("/cricket/observability/{match_id}")
def cricket_observability_for_match(match_id: str) -> dict:
    try:
        return observability_snapshot(match_id=match_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"observability_match_failed:{exc}") from exc


@app.post("/cricket/replay", response_model=CricketReplayResponse)
def cricket_replay(payload: CricketReplayRequest) -> CricketReplayResponse:
    try:
        return run_replay(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"invalid_replay_payload:{exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"cricket_replay_failed:{exc}") from exc


@app.post("/source_refresh_policy", response_model=SourceRefreshResponse)
def source_refresh_policy(payload: SourceRefreshRequest) -> SourceRefreshResponse:
    try:
        return calculate_source_refresh_policy(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"invalid_source_refresh_payload:{exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"source_refresh_policy_failed:{exc}") from exc


@app.post("/calculate_football_odds", response_model=CalculateFootballOddsResponse)
def calculate_football_odds(payload: CalculateFootballOddsRequest) -> CalculateFootballOddsResponse:
    try:
        return run_football_graph(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"invalid_football_payload:{exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"football_calculation_failed:{exc}") from exc


@app.post("/assistant/chat", response_model=AssistantChatResponse)
def assistant_chat(payload: AssistantChatRequest) -> AssistantChatResponse:
    try:
        return run_assistant_graph(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"invalid_assistant_payload:{exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"assistant_failed:{exc}") from exc
