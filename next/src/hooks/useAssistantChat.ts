"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { userApi } from "@/lib/api";
import type { AssistantConversation, AssistantMessage } from "@/lib/api";

function conversationKey() {
  return ["user", "assistant", "conversations"] as const;
}

function messagesKey(conversationId: string) {
  return ["user", "assistant", "messages", conversationId] as const;
}

export function useAssistantConversations() {
  return useQuery({
    queryKey: conversationKey(),
    queryFn: () => userApi.assistant.conversations(),
  });
}

export function useAssistantMessages(conversationId?: string) {
  return useQuery({
    queryKey: conversationId ? messagesKey(conversationId) : ["user", "assistant", "messages", "none"],
    queryFn: () => userApi.assistant.messages(conversationId as string),
    enabled: Boolean(conversationId),
  });
}

export function useEnsureAssistantConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const existing = await userApi.assistant.conversations();
      const rows = existing.data ?? [];
      if (rows.length > 0) {
        return { data: rows[0] };
      }

      return userApi.assistant.createConversation({ title: "Support Assistant" });
    },
    onSuccess: (result) => {
      const conversation = result.data;
      queryClient.setQueryData(conversationKey(), (current: { data?: AssistantConversation[] } | undefined) => {
        const rows = current?.data ?? [];
        if (rows.some((row) => row.id === conversation.id)) {
          return { data: rows };
        }
        return { data: [conversation, ...rows] };
      });
    },
  });
}

export function useSendAssistantMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      optimisticId,
    }: {
      conversationId: string;
      content: string;
      optimisticId: string;
    }) => {
      const payload = await userApi.assistant.sendMessage(conversationId, { content });
      return { optimisticId, payload };
    },
    onMutate: async ({ conversationId, content, optimisticId }) => {
      await queryClient.cancelQueries({ queryKey: messagesKey(conversationId) });

      const previous = queryClient.getQueryData<{ data?: { conversation: AssistantConversation; messages: AssistantMessage[] } }>(
        messagesKey(conversationId)
      );

      const optimisticMessage: AssistantMessage = {
        id: optimisticId,
        role: "user",
        content,
        inserted_at: new Date().toISOString(),
      };

      queryClient.setQueryData(messagesKey(conversationId), (current: { data?: { conversation: AssistantConversation; messages: AssistantMessage[] } } | undefined) => {
        const conversation = current?.data?.conversation ?? ({ id: conversationId, status: "active" } as AssistantConversation);
        const messages = current?.data?.messages ?? [];
        return {
          data: {
            conversation,
            messages: [...messages, optimisticMessage],
          },
        };
      });

      return { previous, conversationId, optimisticId };
    },
    onError: (_error, vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(messagesKey(vars.conversationId), context.previous);
      }
    },
    onSuccess: ({ payload, optimisticId }, vars) => {
      const response = payload.data;

      queryClient.setQueryData(messagesKey(vars.conversationId), {
        data: {
          conversation: response.conversation,
          messages: (queryClient.getQueryData<{ data?: { conversation: AssistantConversation; messages: AssistantMessage[] } }>(
            messagesKey(vars.conversationId)
          )?.data?.messages ?? [])
            .filter((message) => message.id !== optimisticId)
            .concat([response.user_message, response.assistant_message]),
        },
      });

      queryClient.setQueryData(conversationKey(), (current: { data?: AssistantConversation[] } | undefined) => {
        const rows = current?.data ?? [];
        const next = [response.conversation, ...rows.filter((row) => row.id !== response.conversation.id)];
        return { data: next };
      });
    },
  });
}
