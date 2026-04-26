"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { AssistantFaq } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { useCreateAssistantFaq, useUpdateAssistantFaq } from "@/hooks/useAssistantAdmin";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  faq?: AssistantFaq | null;
};

export function AssistantFaqModal({ isOpen, onClose, faq }: Props) {
  const formKey = `${faq?.id ?? "new"}-${faq?.updated_at ?? "draft"}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={faq?.id ? "Edit FAQ" : "Create FAQ"} className="max-w-3xl">
      {isOpen ? <AssistantFaqForm key={formKey} faq={faq} onClose={onClose} /> : null}
    </Modal>
  );
}

function AssistantFaqForm({ faq, onClose }: { faq?: AssistantFaq | null; onClose: () => void }) {
  const createFaq = useCreateAssistantFaq();
  const updateFaq = useUpdateAssistantFaq();
  const [question, setQuestion] = useState(() => faq?.question ?? "");
  const [answer, setAnswer] = useState(() => faq?.answer ?? "");

  const isEditing = Boolean(faq?.id);
  const isPending = createFaq.isPending || updateFaq.isPending;
  const error = createFaq.error ?? updateFaq.error;

  const handleSubmit = async () => {
    if (!question.trim() || !answer.trim()) return;

    if (isEditing && faq) {
      await updateFaq.mutateAsync({
        id: faq.id,
        body: {
          question: question.trim(),
          answer: answer.trim(),
          status: faq.status,
          source: faq.source,
        },
      });
    } else {
      await createFaq.mutateAsync({
        question: question.trim(),
        answer: answer.trim(),
        status: "draft",
        source: "manual",
      });
    }

    onClose();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-[var(--c-text)]">Question</label>
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={4}
          className="w-full rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-[var(--c-text)] outline-none transition-colors focus:border-[var(--c-accent)]"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[var(--c-text)]">Answer</label>
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          rows={10}
          className="w-full rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-[var(--c-text)] outline-none transition-colors focus:border-[var(--c-accent)]"
        />
      </div>

      {error ? (
        <Alert variant="error">
          {error instanceof ApiError ? error.message : "FAQ save failed"}
        </Alert>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={() => void handleSubmit()} disabled={isPending || !question.trim() || !answer.trim()}>
          {isPending ? "Saving..." : isEditing ? "Save FAQ" : "Create FAQ"}
        </Button>
      </div>
    </div>
  );
}
