"use client";

import { useRef, useState } from "react";
import { FileText, UploadCloud } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useUploadAssistantDocument } from "@/hooks/useAssistantAdmin";
import { ApiError } from "@/lib/api";

export function AssistantDocumentUploader() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploader = useUploadAssistantDocument();
  const [dragActive, setDragActive] = useState(false);
  const [title, setTitle] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [lastFileName, setLastFileName] = useState<string | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".md")) {
      setClientError("Only markdown (.md) files are allowed.");
      return;
    }

    setClientError(null);
    const body = new FormData();
    body.append("document", file);
    if (title.trim()) {
      body.append("title", title.trim());
    }

    try {
      await uploader.mutateAsync(body);
      setLastFileName(file.name);
      setTitle("");
    } catch {
      setLastFileName(null);
    }
  };

  return (
    <div className="space-y-4 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.02)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Document Intake</p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Upload Markdown Knowledge</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--c-text-muted)]">
            Private `.md` documents only. Files are stored in the backend vault and chunked for assistant retrieval after upload.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[var(--c-text)]">Optional title override</label>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Fallback is the markdown file name"
          className="w-full rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-[var(--c-text)] outline-none transition-colors focus:border-[var(--c-accent)]"
        />
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          void handleFile(event.dataTransfer.files?.[0] ?? null);
        }}
        className={[
          "w-full rounded-[var(--r-md)] border border-dashed px-5 py-6 text-left transition-colors",
          dragActive
            ? "border-[var(--c-accent)] bg-[rgba(99,32,232,0.12)]"
            : "border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] hover:border-[var(--c-accent)]",
        ].join(" ")}
      >
        <div className="flex items-start gap-4">
          <div className="rounded-[var(--r-sm)] border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.16)] p-3 text-[var(--c-accent)]">
            <UploadCloud className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--c-text)]">Drop markdown file here or click to browse</p>
            <p className="mt-1 text-sm leading-6 text-[var(--c-text-muted)]">
              Client-side restriction: `.md` only. The backend also enforces markdown-only uploads before any file is stored.
            </p>
            {lastFileName ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[var(--c-text)]">
                <FileText className="h-4 w-4" />
                <span className="truncate">{lastFileName}</span>
              </div>
            ) : null}
          </div>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".md,text/markdown,text/plain"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
      />

      {clientError ? <Alert variant="error">{clientError}</Alert> : null}
      {uploader.isError ? (
        <Alert variant="error">
          {uploader.error instanceof ApiError ? uploader.error.message : "Document upload failed"}
        </Alert>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
          {uploader.isPending ? "Uploading and chunking markdown..." : "Assistant vault intake ready"}
        </p>
        <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} disabled={uploader.isPending}>
          {uploader.isPending ? "Uploading..." : "Select File"}
        </Button>
      </div>
    </div>
  );
}
