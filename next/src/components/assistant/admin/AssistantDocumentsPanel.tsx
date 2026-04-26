"use client";

import { Archive, CheckCircle2 } from "lucide-react";
import { AssistantDocumentUploader } from "./AssistantDocumentUploader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useApproveAssistantDocument, useArchiveAssistantDocument, useAssistantDocuments } from "@/hooks/useAssistantAdmin";
import type { AssistantDocument } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export function AssistantDocumentsPanel() {
  const { data, isLoading, isError } = useAssistantDocuments();
  const approve = useApproveAssistantDocument();
  const archive = useArchiveAssistantDocument();
  const documents = ((data as { data?: AssistantDocument[] } | undefined)?.data ?? []) as AssistantDocument[];

  return (
    <div className="space-y-5">
      <AssistantDocumentUploader />

      <Card variant="surface-2" className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Documents</p>
            <h3 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Knowledge File Registry</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">
              Review uploaded markdown files, inspect chunk counts, and move documents between draft, approved, and archived states.
            </p>
          </div>
          <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] px-3 py-2 text-sm text-[var(--c-text-muted)]">
            {documents.length} file(s)
          </div>
        </div>

        {isError ? <Alert variant="error" className="mt-4">Assistant documents failed to load.</Alert> : null}

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-[var(--c-text-faint)]">
              <tr className="border-b border-[var(--c-border)]">
                <th className="px-3 py-3 font-medium">Title</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Chunks</th>
                <th className="px-3 py-3 font-medium">Checksum</th>
                <th className="px-3 py-3 font-medium">Uploaded</th>
                <th className="px-3 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-[var(--c-text-muted)]">Loading documents...</td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-[var(--c-text-muted)]">No assistant documents uploaded yet.</td>
                </tr>
              ) : (
                documents.map((document) => (
                  <DocumentRow
                    key={document.id}
                    document={document}
                    onApprove={() => void approve.mutateAsync(document.id)}
                    onArchive={() => void archive.mutateAsync(document.id)}
                    busy={approve.isPending || archive.isPending}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function DocumentRow({
  document,
  onApprove,
  onArchive,
  busy,
}: {
  document: AssistantDocument;
  onApprove: () => void;
  onArchive: () => void;
  busy: boolean;
}) {
  return (
    <tr className="border-b border-[var(--c-border)]/70 align-top">
      <td className="px-3 py-4">
        <div className="font-medium text-[var(--c-text)]">{document.title}</div>
        <div className="mt-1 text-xs text-[var(--c-text-faint)]">{document.file_name}</div>
      </td>
      <td className="px-3 py-4">
        <span className="inline-flex rounded-full border border-[var(--c-border)] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--c-text-muted)]">
          {document.status}
        </span>
      </td>
      <td className="px-3 py-4 text-[var(--c-text-muted)]">{document.chunks?.length ?? 0}</td>
      <td className="px-3 py-4 text-xs font-mono text-[var(--c-text-faint)]">{document.content_sha256.slice(0, 16)}...</td>
      <td className="px-3 py-4 text-[var(--c-text-muted)]">{formatDateTime(document.inserted_at)}</td>
      <td className="px-3 py-4">
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="px-3 py-2 text-xs" onClick={onApprove} disabled={busy || document.status === "approved"}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            Approve
          </Button>
          <Button type="button" variant="destructive" className="px-3 py-2 text-xs" onClick={onArchive} disabled={busy || document.status === "archived"}>
            <Archive className="mr-1.5 h-4 w-4" />
            Archive
          </Button>
        </div>
      </td>
    </tr>
  );
}
