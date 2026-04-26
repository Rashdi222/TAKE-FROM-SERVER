"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Modal } from "@/components/ui/Modal";
import { Card } from "@/components/ui/Card";
import { getAccessToken } from "@/lib/auth/session";

function getApiBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (base) return base.replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:4000`;
  }

  return "http://127.0.0.1:4000";
}

type Scope = "super" | "master";

export function ReceiptViewerModal({
  isOpen,
  onClose,
  transactionId,
  scope,
}: {
  isOpen: boolean;
  onClose: () => void;
  transactionId: string | null;
  scope: Scope;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !transactionId) return;

    let revokedUrl: string | null = null;
    let disposed = false;

    async function loadReceipt() {
      setLoading(true);
      setError(null);

      try {
        const token = getAccessToken();
        const endpoint =
          scope === "super"
            ? `/api/super-admin/payments/transactions/${transactionId}/receipt`
            : `/api/master-admin/payments/transactions/${transactionId}/receipt`;

        const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || "Failed to load receipt");
        }

        const blob = await res.blob();
        if (disposed) return;

        revokedUrl = URL.createObjectURL(blob);
        setBlobUrl(revokedUrl);
        setContentType(blob.type || res.headers.get("content-type"));
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : "Failed to load receipt");
          setBlobUrl(null);
          setContentType(null);
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    loadReceipt();

    return () => {
      disposed = true;
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
      setBlobUrl(null);
      setContentType(null);
      setError(null);
    };
  }, [isOpen, scope, transactionId]);

  const isPdf = contentType === "application/pdf";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Receipt Review" className="max-w-5xl">
      <div className="space-y-4">
        <p className="text-sm leading-6 text-[var(--c-text-muted)]">
          The receipt is fetched from a protected backend endpoint with authentication. No public file URL is exposed.
        </p>

        {loading ? (
          <Card variant="surface-1" className="p-8 text-center text-[var(--c-text-muted)]">
            Loading receipt...
          </Card>
        ) : error ? (
          <Card variant="surface-1" className="p-8 text-center text-[var(--c-danger)]">
            {error}
          </Card>
        ) : blobUrl ? (
          <Card variant="surface-1" className="overflow-hidden">
            {isPdf ? (
              <iframe title="Receipt PDF" src={blobUrl} className="h-[70vh] w-full bg-white" />
            ) : (
              <div className="relative h-[70vh] w-full bg-black/30">
                <Image src={blobUrl} alt="Uploaded receipt" fill unoptimized className="object-contain" />
              </div>
            )}
          </Card>
        ) : (
          <Card variant="surface-1" className="p-8 text-center text-[var(--c-text-muted)]">
            No receipt available.
          </Card>
        )}
      </div>
    </Modal>
  );
}
