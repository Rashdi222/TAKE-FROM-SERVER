"use client";

import { useMemo, useState } from "react";
import { Archive, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { AssistantFaqModal } from "./AssistantFaqModal";
import {
  useApproveAssistantFaq,
  useArchiveAssistantFaq,
  useAssistantFaqs,
  useDeleteAssistantFaq,
} from "@/hooks/useAssistantAdmin";
import type { AssistantFaq } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export function AssistantFaqsPanel() {
  const { data, isLoading, isError } = useAssistantFaqs();
  const approve = useApproveAssistantFaq();
  const archive = useArchiveAssistantFaq();
  const remove = useDeleteAssistantFaq();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<AssistantFaq | null>(null);

  const faqs = useMemo(
    () => (((data as { data?: AssistantFaq[] } | undefined)?.data ?? []) as AssistantFaq[]),
    [data]
  );

  return (
    <div className="space-y-5">
      <Card variant="surface-2" className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">FAQs</p>
            <h3 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Manual FAQ Desk</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
              Curate canonical question-and-answer pairs for the assistant. Drafts stay private until approved.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            className="px-4 py-2.5"
            onClick={() => {
              setEditingFaq(null);
              setModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New FAQ
          </Button>
        </div>

        {isError ? <Alert variant="error" className="mt-4">Assistant FAQs failed to load.</Alert> : null}

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-[var(--c-text-faint)]">
              <tr className="border-b border-[var(--c-border)]">
                <th className="px-3 py-3 font-medium">Question</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Source</th>
                <th className="px-3 py-3 font-medium">Usage</th>
                <th className="px-3 py-3 font-medium">Updated</th>
                <th className="px-3 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-[var(--c-text-muted)]">Loading FAQs...</td>
                </tr>
              ) : faqs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-[var(--c-text-muted)]">No assistant FAQs yet.</td>
                </tr>
              ) : (
                faqs.map((faq) => (
                  <tr key={faq.id} className="border-b border-[var(--c-border)]/70 align-top">
                    <td className="px-3 py-4">
                      <div className="font-medium text-[var(--c-text)]">{faq.question}</div>
                      <div className="mt-2 line-clamp-2 max-w-3xl text-[var(--c-text-muted)]">{faq.answer}</div>
                    </td>
                    <td className="px-3 py-4 text-[var(--c-text-muted)]">{faq.status}</td>
                    <td className="px-3 py-4 text-[var(--c-text-muted)]">{faq.source}</td>
                    <td className="px-3 py-4 text-[var(--c-text-muted)]">{faq.usage_count}</td>
                    <td className="px-3 py-4 text-[var(--c-text-muted)]">{formatDateTime(faq.updated_at)}</td>
                    <td className="px-3 py-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="px-3 py-2 text-xs"
                          onClick={() => {
                            setEditingFaq(faq);
                            setModalOpen(true);
                          }}
                        >
                          <Pencil className="mr-1.5 h-4 w-4" />
                          Edit
                        </Button>
                        <Button type="button" variant="secondary" className="px-3 py-2 text-xs" onClick={() => void approve.mutateAsync(faq.id)}>
                          <CheckCircle2 className="mr-1.5 h-4 w-4" />
                          Approve
                        </Button>
                        <Button type="button" variant="secondary" className="px-3 py-2 text-xs" onClick={() => void archive.mutateAsync(faq.id)}>
                          <Archive className="mr-1.5 h-4 w-4" />
                          Archive
                        </Button>
                        <Button type="button" variant="destructive" className="px-3 py-2 text-xs" onClick={() => void remove.mutateAsync(faq.id)}>
                          <Trash2 className="mr-1.5 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <AssistantFaqModal isOpen={modalOpen} onClose={() => setModalOpen(false)} faq={editingFaq} />
    </div>
  );
}
