"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import type { ForgotPasswordSupportLookupResponse } from "@/lib/api/types/resetSupport";
import { useForgotPasswordSupportLookup } from "@/hooks/useResetSupport";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

function buildSupportMessage(result: ForgotPasswordSupportLookupResponse) {
  const lines = [
    "Hi, I need help resetting my account password.",
    "",
    "My account details are:",
    `👤 Username: ${result.requester?.username || "Unavailable"}`,
    `📧 Email: ${result.requester?.email || "Unavailable"}`,
    `📱 Phone: ${result.requester?.phone_number || "Unavailable"}`,
    `💰 Balance: ${result.requester?.balance && result.requester?.account_currency ? `${result.requester.account_currency} ${result.requester.balance}` : result.requester?.balance || "Unavailable"}`,
    "",
    "Please help me reset the password for this account.",
  ];

  return lines.join("\n");
}

function contactHref(channel: string, value: string, result?: ForgotPasswordSupportLookupResponse | null) {
  const digits = value.replace(/\D/g, "");
  const message = result ? buildSupportMessage(result) : "";

  if (channel === "whatsapp") {
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }

  if (channel === "email") {
    return `mailto:${value}?subject=${encodeURIComponent("Password reset support request")}&body=${encodeURIComponent(message)}`;
  }

  return `tel:${value}`;
}

export function ForgotPasswordSupportLookup() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const lookup = useForgotPasswordSupportLookup();
  const result = lookup.data?.data;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedPhone = phoneNumber.trim();
    const trimmedEmail = email.trim();

    try {
      await lookup.mutateAsync({
        phone_number: trimmedPhone || undefined,
        email: trimmedPhone ? undefined : trimmedEmail || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lookup failed");
    }
  };

  return (
    <div className="space-y-6">
      <Card variant="surface-2" className="p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Forgot Password</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--c-text)]">Find your reset support contact</h1>
        <p className="mt-2 text-sm text-[var(--c-text-muted)]">
          Enter the phone number or email linked to your account. We will show the correct support contact for your reset request.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <Input
            label="Phone number"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+923001234567"
          />

          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
            <span className="h-px flex-1 bg-[var(--c-border)]" />
            or use email
            <span className="h-px flex-1 bg-[var(--c-border)]" />
          </div>

          <Input
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="player@sixerbat.com"
          />

          <Button type="submit" variant="primary" disabled={lookup.isPending}>
            {lookup.isPending ? "Checking..." : "Find support"}
          </Button>
        </form>

        {error ? <Alert variant="error" className="mt-4">{error}</Alert> : null}
      </Card>

      {result ? (
        <Card variant="surface-2" className="p-6">
          <h2 className="text-lg font-semibold text-[var(--c-text)]">Lookup result</h2>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">{result.message}</p>

          {!result.available || result.contacts.length === 0 ? (
            <Alert variant="warning" className="mt-4">
              No active reset support contact is available for this account right now. Try the other lookup option or contact platform support.
            </Alert>
          ) : (
            <div className="mt-5 space-y-3">
              {result.owner_name ? (
                <p className="text-sm text-[var(--c-text-muted)]">
                  Support owner: <span className="text-[var(--c-text)]">{result.owner_name}</span>
                </p>
              ) : null}

              {result.contacts.map((contact) => (
                <div
                  key={String(contact.id)}
                  className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.02)] p-4"
                >
                  <p className="text-sm font-medium text-[var(--c-text)]">
                    {contact.label || (contact.channel === "whatsapp" ? "WhatsApp" : contact.channel === "email" ? "Email" : "Phone")}
                  </p>
                  <p className="mt-1 font-mono text-sm text-[var(--c-text-muted)]">{contact.value}</p>
                  <a
                    href={contactHref(String(contact.channel), String(contact.value), result)}
                    target={contact.channel === "email" ? undefined : "_blank"}
                    rel={contact.channel === "email" ? undefined : "noreferrer"}
                    className="mt-3 inline-flex rounded-[var(--r-sm)] border border-[var(--c-accent)] px-3 py-2 text-sm text-[var(--c-text)] transition hover:bg-[rgba(99,32,232,0.14)]"
                  >
                    Contact via {contact.channel === "whatsapp" ? "WhatsApp" : contact.channel === "email" ? "email" : "phone"}
                  </a>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
