"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { superAdminApi } from "@/lib/api";

export function useAssistantDocuments(status?: string) {
  return useQuery({
    queryKey: ["super-admin", "assistant", "documents", status ?? "all"],
    queryFn: () => superAdminApi.assistant.documents(status ? { status } : undefined),
  });
}

export function useUploadAssistantDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: FormData) => superAdminApi.assistant.uploadDocument(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "assistant", "documents"] });
    },
  });
}

export function useApproveAssistantDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.assistant.approveDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "assistant", "documents"] });
    },
  });
}

export function useArchiveAssistantDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.assistant.archiveDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "assistant", "documents"] });
    },
  });
}

export function useAssistantFaqs(status?: string) {
  return useQuery({
    queryKey: ["super-admin", "assistant", "faqs", status ?? "all"],
    queryFn: () => superAdminApi.assistant.faqs(status ? { status } : undefined),
  });
}

export function useCreateAssistantFaq() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.assistant.createFaq(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "assistant", "faqs"] });
    },
  });
}

export function useUpdateAssistantFaq() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      superAdminApi.assistant.updateFaq(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "assistant", "faqs"] });
    },
  });
}

export function useDeleteAssistantFaq() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.assistant.deleteFaq(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "assistant", "faqs"] });
    },
  });
}

export function useApproveAssistantFaq() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.assistant.approveFaq(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "assistant", "faqs"] });
    },
  });
}

export function useArchiveAssistantFaq() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.assistant.archiveFaq(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "assistant", "faqs"] });
    },
  });
}

export function useAssistantFaqDrafts(status?: string) {
  return useQuery({
    queryKey: ["super-admin", "assistant", "faq-drafts", status ?? "all"],
    queryFn: () => superAdminApi.assistant.faqDrafts(status ? { status } : undefined),
  });
}

export function useDismissAssistantFaqDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.assistant.dismissFaqDraft(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "assistant", "faq-drafts"] });
    },
  });
}

export function useAssistantAnalytics() {
  return useQuery({
    queryKey: ["super-admin", "assistant", "analytics"],
    queryFn: () => superAdminApi.assistant.analytics(),
  });
}
