"use client";

import { Ban } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useAssistantFaqDrafts, useDismissAssistantFaqDraft } from "@/hooks/useAssistantAdmin";
import type { AssistantFaqDraft } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export function AssistantDraftsPanel() {
  const { data, isLoading, isError } = useAssistantFaqDrafts();
  const dismiss = useDismissAssistantFaqDraft();
  const drafts = ((data as { data?: AssistantFaqDraft[] } | undefined)?.data ?? []) as AssistantFaqDraft[];

  return (
    <Card variant="surface-2" className="p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Draft Reviews</p>
        <h3 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Suggested FAQ Queue</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
          These are assistant FAQ candidates generated from repeated question patterns. Review them before they are promoted into live retrieval content.
        </p>
      </div>

      {isError ? <Alert variant="error" className="mt-4">Assistant draft FAQs failed to load.</Alert> : null}

      <div className="mt-5 grid gap-4">
        {isLoading ? (
          <div className="text-sm text-[var(--c-text-muted)]">Loading FAQ drafts...</div>
        ) : drafts.length === 0 ? (
          <Alert variant="info">No draft FAQs have been generated yet.</Alert>
        ) : (
          drafts.map((draft) => (
            <div key={draft.id} className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.02)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                    Digest {draft.question_digest_key}
                  </div>
                  <div className="text-lg font-semibold text-[var(--c-text)]">{draft.suggested_question}</div>
                  {draft.suggested_answer ? (
                    <p className="max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">{draft.suggested_answer}</p>
                  ) : (
                    <p className="text-sm text-[var(--c-text-muted)]">No suggested answer yet. Admin review required.</p>
                  )}
                </div>
                <div className="text-right text-xs text-[var(--c-text-faint)]">
                  <div>{draft.evidence_count} evidence item(s)</div>
                  <div className="mt-1">{formatDateTime(draft.updated_at)}</div>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button type="button" variant="destructive" className="px-3 py-2 text-xs" onClick={() => void dismiss.mutateAsync(draft.id)}>
                  <Ban className="mr-1.5 h-4 w-4" />
                  Dismiss Draft
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
