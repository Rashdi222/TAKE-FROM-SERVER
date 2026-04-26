"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileText, CheckCircle2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/errors";
import { useUploadDepositReceipt } from "@/hooks/usePayments";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function ReceiptUploadField({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const uploader = useUploadDepositReceipt();

  const handleFile = async (file: File | null) => {
    if (!file) return;

    const body = new FormData();
    body.append("receipt", file);

    try {
      const response = await uploader.mutateAsync(body);
      const payload = response?.data;
      onChange(payload?.receipt_path ?? "");
      setUploadedName(payload?.file_name || file.name);
    } catch {
      onChange("");
      setUploadedName(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-[var(--c-text)]">Deposit Receipt</label>
        {value ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
          </span>
        ) : null}
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
            <p className="text-sm font-semibold text-[var(--c-text)]">Upload payment proof</p>
            <p className="mt-1 text-sm leading-6 text-[var(--c-text-muted)]">
              Drag and drop your receipt here, or click to select a file. Accepted: JPG, PNG, WEBP, PDF.
            </p>
            {uploadedName ? (
              <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[var(--c-text)]">
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">{uploadedName}</span>
              </div>
            ) : null}
          </div>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
      />

      {uploader.isError ? (
        <Alert variant="error">
          {uploader.error instanceof ApiError ? uploader.error.message : "Receipt upload failed"}
        </Alert>
      ) : null}

      {uploader.isPending ? (
        <div className="flex items-center justify-between rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--c-text-muted)]">
          <span>Uploading receipt securely…</span>
          <Button type="button" variant="secondary" className="pointer-events-none px-3 py-1 text-xs">
            Uploading
          </Button>
        </div>
      ) : null}
    </div>
  );
}
