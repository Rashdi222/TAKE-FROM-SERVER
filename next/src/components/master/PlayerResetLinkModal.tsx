"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

export function PlayerResetLinkModal({
  isOpen,
  onClose,
  resetUrl,
  expiresAt,
  isPending,
  isError,
  onGenerate,
}: {
  isOpen: boolean;
  onClose: () => void;
  resetUrl?: string | null;
  expiresAt?: string | null;
  isPending?: boolean;
  isError?: boolean;
  onGenerate: () => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!resetUrl) return;
    await navigator.clipboard.writeText(resetUrl);
    setCopied(true);
  };

  const whatsappText = resetUrl
    ? `Reset your Sixerbat password using this link: ${resetUrl}`
    : "";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Generate Password Reset Link" className="max-w-2xl">
      <div className="space-y-4">
        {isError ? <Alert variant="error">Request failed. Please try again.</Alert> : null}

        <Alert variant="info">
          Generate a one-time link for the player. You can send it through WhatsApp so the player sets the password personally.
        </Alert>

        {!resetUrl ? (
          <Button variant="primary" onClick={() => void onGenerate()} disabled={isPending}>
            {isPending ? "Generating..." : "Generate reset link"}
          </Button>
        ) : (
          <>
            <Input label="Reset link" value={resetUrl} readOnly onChange={() => undefined} />

            <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4 text-sm text-[var(--c-text-muted)]">
              <p>Expires: {expiresAt ? new Date(expiresAt).toLocaleString() : "-"}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--c-text)]">WhatsApp message</label>
              <textarea
                value={whatsappText}
                readOnly
                rows={4}
                className="w-full rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm leading-6 text-[var(--c-text)]"
              />
            </div>

            {copied ? <Alert variant="success">Reset link copied.</Alert> : null}

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => void handleCopy()}>
                Copy link
              </Button>
              <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(whatsappText)}>
                Copy WhatsApp text
              </Button>
              <Button variant="primary" onClick={() => void onGenerate()} disabled={isPending}>
                {isPending ? "Generating..." : "Generate new link"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
