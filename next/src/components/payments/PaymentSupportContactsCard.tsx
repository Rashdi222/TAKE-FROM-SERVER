"use client";

import type { ForgotPasswordSupportLookupResponse } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";

type Props = {
  title: string;
  description: string;
  result?: ForgotPasswordSupportLookupResponse | null;
  requestedAmount?: string | null;
};

function buildSupportMessage(result: ForgotPasswordSupportLookupResponse, requestedAmount?: string | null) {
  const lines = [
    "Hi, I need help with a deposit balance request.",
    "",
    "My account details are:",
    `👤 Username: ${result.requester?.username || "Unavailable"}`,
    `📧 Email: ${result.requester?.email || "Unavailable"}`,
    `📱 Phone: ${result.requester?.phone_number || "Unavailable"}`,
    `💰 Balance: ${
      result.requester?.balance && result.requester?.account_currency
        ? `${result.requester.account_currency} ${result.requester.balance}`
        : result.requester?.balance || "Unavailable"
    }`,
    `🧾 Requested Deposit: ${requestedAmount || "Not specified"}`,
    "",
    "Please review and help me with the deposit balance for this account.",
  ];

  return lines.join("\n");
}

function contactHref(channel: string, value: string, result: ForgotPasswordSupportLookupResponse, requestedAmount?: string | null) {
  const message = buildSupportMessage(result, requestedAmount);
  const digits = value.replace(/\D/g, "");

  if (channel === "whatsapp") {
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }

  if (channel === "email") {
    return `mailto:${value}?subject=${encodeURIComponent("Deposit support request")}&body=${encodeURIComponent(message)}`;
  }

  return `tel:${value}`;
}

export function PaymentSupportContactsCard({ title, description, result, requestedAmount }: Props) {
  return (
    <Card variant="surface-2" className="p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Support Contacts</p>
      <h3 className="mt-2 text-xl font-semibold text-[var(--c-text)]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">{description}</p>

      {!result ? (
        <div className="mt-4 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.02)] p-4 text-sm text-[var(--c-text-muted)]">
          Loading support contacts...
        </div>
      ) : !result.available || result.contacts.length === 0 ? (
        <Alert variant="warning" className="mt-4">
          No active support contact is available right now.
        </Alert>
      ) : (
        <div className="mt-5 space-y-3">
          {result.owner_name ? (
            <p className="text-sm text-[var(--c-text-muted)]">
              Contact owner: <span className="text-[var(--c-text)]">{result.owner_name}</span>
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
                href={contactHref(String(contact.channel), String(contact.value), result, requestedAmount)}
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
  );
}
