"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, MessageSquareText, SendHorizontal } from "lucide-react";
import { AuthGuard } from "@/lib/auth/AuthGuard";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ApiError, type AssistantMessage } from "@/lib/api";
import {
  useAssistantConversations,
  useAssistantMessages,
  useEnsureAssistantConversation,
  useSendAssistantMessage,
} from "@/hooks/useAssistantChat";
import { formatDateTime } from "@/lib/format";

export function AssistantChatShell() {
  const { data: conversationsData } = useAssistantConversations();
  const ensureConversation = useEnsureAssistantConversation();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const sendMessage = useSendAssistantMessage();

  const conversations = useMemo(
    () => (((conversationsData as { data?: { id: string }[] } | undefined)?.data ?? []) as { id: string }[]),
    [conversationsData]
  );

  useEffect(() => {
    if (activeConversationId || ensureConversation.isPending) return;

    if (conversations.length > 0) {
      setActiveConversationId(conversations[0].id);
      return;
    }

    void ensureConversation.mutateAsync().then((response) => {
      setActiveConversationId(response.data.id);
    });
  }, [activeConversationId, conversations, ensureConversation]);

  const { data: messagesData, isLoading: messagesLoading, isError: messagesError } = useAssistantMessages(activeConversationId ?? undefined);

  const messages = useMemo(
    () => (((messagesData as { data?: { messages?: AssistantMessage[] } } | undefined)?.data?.messages ?? []) as AssistantMessage[]),
    [messagesData]
  );

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, thinking]);

  const handleSend = async () => {
    if (!activeConversationId || !composer.trim() || sendMessage.isPending) return;

    const content = composer.trim();
    setComposer("");
    setThinking(true);

    try {
      await sendMessage.mutateAsync({
        conversationId: activeConversationId,
        content,
        optimisticId: `optimistic-${Date.now()}`,
      });
    } finally {
      setThinking(false);
    }
  };

  return (
    <AuthGuard allowedRoles={["player"]}>
      <div className="mx-auto max-w-6xl px-3 py-6">
        <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <Card variant="surface-2" className="p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Assistant</p>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--c-text)]">Sixerbat Help Desk</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">
              Ask about account access, wallet flows, deposits, withdrawals, live match visibility, or other player-side Sixerbat questions. The assistant uses approved guidance when available and gives a direct next step when it is not.
            </p>

            <div className="mt-5 space-y-3">
              {conversations.length === 0 ? (
                <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--c-text-muted)]">
                  Creating your first assistant thread...
                </div>
              ) : (
                conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setActiveConversationId(conversation.id)}
                    className={`w-full rounded-[var(--r-md)] border px-4 py-3 text-left transition ${
                      activeConversationId === conversation.id
                        ? "border-[var(--c-accent)] bg-[rgba(99,32,232,0.16)]"
                        : "border-[var(--c-border)] bg-[rgba(255,255,255,0.03)]"
                    }`}
                  >
                    <div className="font-medium text-[var(--c-text)]">Support Assistant</div>
                    <div className="mt-1 text-xs text-[var(--c-text-faint)]">{conversation.id}</div>
                  </button>
                ))
              )}
            </div>
          </Card>

          <Card variant="surface-2" className="flex min-h-[72vh] flex-col">
            <div className="border-b border-[var(--c-border)] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full border border-[rgba(161,121,241,0.24)] bg-[rgba(99,32,232,0.16)] p-2 text-[var(--c-accent)]">
                  <Bot className="h-5 w-5" />
                </div>
                  <div>
                    <div className="font-semibold text-[var(--c-text)]">Sixerbat Assistant</div>
                    <div className="text-sm text-[var(--c-text-muted)]">
                    {thinking ? "Thinking through your request..." : "Friendly player-side help with approved support guidance behind it."}
                  </div>
                </div>
              </div>
            </div>

            <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {messagesError ? <Alert variant="error">Assistant history failed to load.</Alert> : null}

              {messagesLoading && messages.length === 0 ? (
                <div className="text-sm text-[var(--c-text-muted)]">Loading conversation...</div>
              ) : messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <div className="rounded-full border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] p-4 text-[var(--c-accent)]">
                    <MessageSquareText className="h-7 w-7" />
                  </div>
                  <div className="max-w-md text-sm leading-6 text-[var(--c-text-muted)]">
                    Start the conversation. You can ask about deposits, withdrawals, account access, live match visibility, support flows, or general Sixerbat user-side questions.
                  </div>
                </div>
              ) : (
                messages.map((message) => <ChatBubble key={message.id} message={message} />)
              )}

              {thinking ? <ThinkingBubble /> : null}
            </div>

            <div className="border-t border-[var(--c-border)] px-5 py-4">
              {sendMessage.isError ? (
                <Alert variant="error" className="mb-3">
                  {sendMessage.error instanceof ApiError ? sendMessage.error.message : "Assistant request failed"}
                </Alert>
              ) : null}

              <div className="flex items-end gap-3">
                <textarea
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  rows={3}
                  placeholder="Ask about deposits, withdrawals, account access, live matches, or any Sixerbat player question..."
                  disabled={!activeConversationId || sendMessage.isPending || thinking}
                  className="min-h-[4.75rem] flex-1 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-[var(--c-text)] outline-none transition-colors focus:border-[var(--c-accent)] disabled:opacity-60"
                />
                <Button
                  type="button"
                  variant="primary"
                  className="px-4 py-3"
                  onClick={() => void handleSend()}
                  disabled={!activeConversationId || !composer.trim() || sendMessage.isPending || thinking}
                >
                  <SendHorizontal className="mr-2 h-4 w-4" />
                  {thinking ? "Waiting..." : "Send"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AuthGuard>
  );
}

function ChatBubble({ message }: { message: AssistantMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-[1.25rem] px-4 py-3 ${
          isUser
            ? "border border-[rgba(161,121,241,0.25)] bg-[rgba(99,32,232,0.9)] text-white shadow-[0_10px_28px_rgba(99,32,232,0.2)]"
            : "border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] text-[var(--c-text)]"
        }`}
      >
        <div className="whitespace-pre-wrap text-sm leading-6">{message.content}</div>
        <div className={`mt-2 text-[10px] uppercase tracking-[0.14em] ${isUser ? "text-white/70" : "text-[var(--c-text-faint)]"}`}>
          {isUser ? "You" : "Assistant"} {message.inserted_at ? `• ${formatDateTime(message.inserted_at)}` : ""}
        </div>
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div className="rounded-[1.25rem] border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-[var(--c-text)]">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--c-accent)]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--c-accent)] [animation-delay:120ms]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--c-accent)] [animation-delay:240ms]" />
        </div>
        <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-[var(--c-text-faint)]">Assistant thinking</div>
      </div>
    </div>
  );
}
