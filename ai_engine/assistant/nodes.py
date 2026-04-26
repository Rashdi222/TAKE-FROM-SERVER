from __future__ import annotations

from typing import Any

from .prompts import SYSTEM_RULES
from .schemas import AssistantChatRequest


def classify_intent_node(state: dict[str, Any]) -> dict[str, Any]:
    request: AssistantChatRequest = state["request"]
    message = request.message.lower()

    faq_match = first_faq_match(request, message)
    doc_matches = matching_docs(request, message)

    answer_type = "fallback"
    retrieval_used = False

    if faq_match is not None:
        answer_type = "faq"
        retrieval_used = True
    elif doc_matches:
        answer_type = "document"
        retrieval_used = True

    faq_signal = should_raise_faq_signal(request, faq_match, doc_matches)

    return {
        **state,
        "faq_match": faq_match,
        "doc_matches": doc_matches,
        "answer_type": answer_type,
        "retrieval_used": retrieval_used,
        "faq_signal": faq_signal,
    }


def generate_response_node(state: dict[str, Any]) -> dict[str, Any]:
    request: AssistantChatRequest = state["request"]
    faq_match = state.get("faq_match")
    doc_matches = state.get("doc_matches", [])
    answer_type = state["answer_type"]
    _ = SYSTEM_RULES

    if answer_type == "faq" and faq_match is not None:
        reply = faq_match.answer.strip()
    elif answer_type == "document" and doc_matches:
        top_chunk = doc_matches[0]
        title = top_chunk.document_title or "the current Sixerbat guide"
        heading = f" ({top_chunk.heading_path})" if top_chunk.heading_path else ""
        reply = (
            f"Here is the clearest guidance I found from {title}{heading}:\n\n"
            f"{top_chunk.content.strip()}"
        )
    else:
        reply = support_playbook_reply(request)

    retrieval_sources = []
    if faq_match is not None:
        retrieval_sources.append(
            {"type": "faq", "id": faq_match.id, "title": faq_match.question}
        )
    for chunk in doc_matches[:3]:
        retrieval_sources.append(
            {
                "type": "document_chunk",
                "id": chunk.id,
                "title": chunk.heading_path or chunk.document_title,
            }
        )

    return {
        **state,
        "reply": reply,
        "retrieval_sources": retrieval_sources,
        "usage": {
            "prompt_tokens": estimate_tokens(request.message) + estimate_tokens(request.system_profile),
            "completion_tokens": estimate_tokens(reply),
        },
    }


def first_faq_match(request: AssistantChatRequest, message: str):
    message_tokens = token_set(message)
    best_match = None
    best_score = 0

    for faq in request.retrieved_faqs:
        score = overlap_score(message_tokens, token_set(faq.question.lower()))
        if score > best_score:
            best_score = score
            best_match = faq

    return best_match if best_score >= 0.34 else None


def matching_docs(request: AssistantChatRequest, message: str):
    message_tokens = token_set(message)
    scored: list[tuple[float, Any]] = []

    for chunk in request.retrieved_docs:
        basis = f"{chunk.document_title or ''} {chunk.heading_path or ''} {chunk.content}".lower()
        score = overlap_score(message_tokens, token_set(basis))
        if score >= 0.18:
            scored.append((score, chunk))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [chunk for _, chunk in scored[:3]]


def should_raise_faq_signal(request: AssistantChatRequest, faq_match, doc_matches: list[Any]) -> bool:
    if faq_match is not None:
        return False

    message = request.message.strip()
    if len(message) < 12:
        return False

    if len(doc_matches) > 0:
        return True

    starters = ("how", "what", "why", "when", "where", "can", "do", "is", "are")
    return message.lower().startswith(starters)


def token_set(value: str) -> set[str]:
    return {token for token in value.split() if len(token) >= 3}


def overlap_score(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / max(len(left), 1)


def estimate_tokens(text: str) -> int:
    return max(1, len(text.split()))


def support_playbook_reply(request: AssistantChatRequest) -> str:
    message = request.message.lower()

    if any(token in message for token in ("deposit", "add money", "payment method", "receipt")):
        return (
            "For deposits on Sixerbat, the usual flow is: choose an available payment method, "
            "submit the amount, upload the required receipt if the method needs proof, and then wait "
            "for approval. If you need an exact review time for your case, contact support because I "
            "do not have a confirmed live SLA in the approved knowledge I can see."
        )

    if any(token in message for token in ("withdraw", "cash out", "payout")):
        return (
            "For withdrawals, make sure the payment method supports cash-out, submit the correct account "
            "title and wallet or account number, and then wait for approval. If the request is delayed, "
            "support can confirm the current review queue and the next action."
        )

    if any(token in message for token in ("reset", "forgot password", "password", "login problem")):
        return (
            "If you cannot access your account, use the reset-password support flow with the phone number "
            "or email linked to your account. Sixerbat should then show the correct support contact for your case."
        )

    if any(token in message for token in ("live match", "live odds", "in play", "live betting")):
        return (
            "Sixerbat can show live match coverage and published markets when the event is available on the platform. "
            "If a market is missing or suspended, that usually means the live feed or trading workflow has not published it yet."
        )

    if any(token in message for token in ("wallet", "balance", "funds")):
        return (
            "Your Sixerbat wallet balance changes only after the relevant backend flow completes, such as a deposit approval, "
            "a withdrawal approval, or bet settlement. If something looks off, support should check the transaction history against your account."
        )

    return (
        "I do not have a confirmed answer for that from the current Sixerbat knowledge I can see. "
        "Ask in a more specific way, or contact support for a confirmed user-facing answer."
    )
