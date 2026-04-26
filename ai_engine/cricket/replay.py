from __future__ import annotations

from collections import Counter
from statistics import mean
from typing import Any

from pydantic import BaseModel, Field

from cricket.orchestrator import CalculateOddsRequest, run_graph, CRICKET_MEMORY


class CricketReplayRequest(BaseModel):
    frames: list[CalculateOddsRequest] = Field(default_factory=list)
    reset_memory: bool = True


class CricketReplayFrameResult(BaseModel):
    match_id: str
    state_version: int
    event_seq: int
    reviewer_decision: str
    latency_ms: int
    quote_count: int
    playbooks: list[str] = Field(default_factory=list)
    lifecycle_analytics: dict[str, Any] = Field(default_factory=dict)


class CricketReplayResponse(BaseModel):
    frame_count: int
    avg_latency_ms: int
    reviewer_decisions: dict[str, int]
    active_playbooks: dict[str, int]
    frames: list[CricketReplayFrameResult] = Field(default_factory=list)


def run_replay(payload: CricketReplayRequest) -> CricketReplayResponse:
    frames = list(payload.frames or [])
    if payload.reset_memory:
        for match_id in {frame.match_id for frame in frames}:
            CRICKET_MEMORY.clear(match_id)

    results: list[CricketReplayFrameResult] = []
    decision_counter: Counter[str] = Counter()
    playbook_counter: Counter[str] = Counter()
    latencies: list[int] = []

    for frame in frames:
        response = run_graph(frame)
        decision_counter[response.reviewer_decision] += 1
        latencies.append(response.latency_ms)
        playbook_counter.update(response.active_playbooks)
        results.append(
            CricketReplayFrameResult(
                match_id=response.match_id,
                state_version=response.state_version,
                event_seq=frame.event_seq,
                reviewer_decision=response.reviewer_decision,
                latency_ms=response.latency_ms,
                quote_count=len(response.markets) + len(response.fancy_markets),
                playbooks=response.active_playbooks,
                lifecycle_analytics=response.lifecycle_analytics,
            )
        )

    return CricketReplayResponse(
        frame_count=len(results),
        avg_latency_ms=int(mean(latencies)) if latencies else 0,
        reviewer_decisions=dict(decision_counter),
        active_playbooks=dict(playbook_counter),
        frames=results,
    )
