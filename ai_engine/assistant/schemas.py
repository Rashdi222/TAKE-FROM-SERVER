from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, ConfigDict


class AssistantMessage(BaseModel):
    id: str | None = None
    role: str
    content: str
    inserted_at: str | None = None


class AssistantFaq(BaseModel):
    id: str | None = None
    question: str
    answer: str


class AssistantDocChunk(BaseModel):
    id: str | None = None
    document_id: str | None = None
    document_title: str | None = None
    heading_path: str | None = None
    content: str


class AssistantChatRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    conversation_id: str
    user_id: str
    message: str
    model: str
    system_profile: str
    recent_messages: list[AssistantMessage] = Field(default_factory=list)
    conversation_summary: str | None = None
    retrieved_faqs: list[AssistantFaq] = Field(default_factory=list)
    retrieved_docs: list[AssistantDocChunk] = Field(default_factory=list)
    runtime_flags: dict[str, Any] = Field(default_factory=dict)


class AssistantUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0


class AssistantChatResponse(BaseModel):
    reply: str
    model: str
    answer_type: str
    retrieval_used: bool = False
    retrieval_sources: list[dict[str, Any]] = Field(default_factory=list)
    usage: AssistantUsage = Field(default_factory=AssistantUsage)
    faq_signal: bool = False
