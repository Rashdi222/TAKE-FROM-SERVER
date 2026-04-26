from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from .nodes import classify_intent_node, generate_response_node
from .schemas import AssistantChatRequest, AssistantChatResponse, AssistantUsage


class AssistantGraphState(TypedDict, total=False):
    request: AssistantChatRequest
    faq_match: Any
    doc_matches: list[Any]
    answer_type: str
    retrieval_used: bool
    faq_signal: bool
    reply: str
    retrieval_sources: list[dict[str, Any]]
    usage: dict[str, int]


def build_assistant_graph():
    graph = StateGraph(AssistantGraphState)
    graph.add_node("classify_intent", classify_intent_node)
    graph.add_node("generate_response", generate_response_node)
    graph.set_entry_point("classify_intent")
    graph.add_edge("classify_intent", "generate_response")
    graph.add_edge("generate_response", END)
    return graph.compile()


ASSISTANT_GRAPH = build_assistant_graph()


def run_assistant_graph(request: AssistantChatRequest) -> AssistantChatResponse:
    state = ASSISTANT_GRAPH.invoke({"request": request})
    usage = state.get("usage", {})

    return AssistantChatResponse(
        reply=state["reply"],
        model=request.model,
        answer_type=state.get("answer_type", "fallback"),
        retrieval_used=state.get("retrieval_used", False),
        retrieval_sources=state.get("retrieval_sources", []),
        usage=AssistantUsage(
            prompt_tokens=int(usage.get("prompt_tokens", 0)),
            completion_tokens=int(usage.get("completion_tokens", 0)),
        ),
        faq_signal=bool(state.get("faq_signal", False)),
    )
