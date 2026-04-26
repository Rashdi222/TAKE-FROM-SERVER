"use client";

import Link from "next/link";
import { MethodToggle } from "@/components/payments/MethodToggle";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PaymentMethod } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useSuperAdminPaymentMethods } from "@/hooks/useSuperAdmin";
import { resolvePaymentMethodLogoSrc } from "@/lib/payments/paymentMethodPresets";

export default function PaymentMethodsPage() {
  const { data, isLoading } = useSuperAdminPaymentMethods();
  const methods: PaymentMethod[] = ((data as { data?: PaymentMethod[] } | undefined)?.data ?? []) as PaymentMethod[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Payments</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Payment Methods</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
            Control the bank and wallet destinations players can use. Payment methods are now structured records instead of raw JSON blobs.
          </p>
        </div>
        <Link href="/admin/payments/methods/create">
          <Button variant="primary">Configure Method</Button>
        </Link>
      </div>

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading payment methods...</p>
      ) : methods.length === 0 ? (
        <Card variant="surface-1" className="p-6">
          <p className="text-center text-[var(--c-text-muted)]">No payment methods configured yet.</p>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {methods.map((method) => (
            <Card key={method.id} variant="surface-2" className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-white/10 bg-black/15">
                    {method.logo_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolvePaymentMethodLogoSrc(String(method.logo_path)) || ""}
                        alt={String(method.method_name ?? method.provider)}
                        className="h-full w-full object-contain p-2"
                      />
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Method</p>
                    <h2 className="mt-2 text-2xl font-semibold text-[var(--c-text)]">{String(method.method_name ?? method.provider)}</h2>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{String(method.provider)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {method.supports_deposit ? <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-200">Deposit</span> : null}
                      {method.supports_withdrawal ? <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-sky-200">Withdrawal</span> : null}
                    </div>
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    method.is_active
                      ? "border border-[var(--c-success)] bg-[var(--c-success)]/15 text-[var(--c-success)]"
                      : "border border-[var(--c-border)] bg-[var(--c-surface-1)] text-[var(--c-text-muted)]"
                  }`}
                >
                  {method.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              <dl className="mt-6 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-[var(--c-text-muted)]">Method ID</dt>
                  <dd className="font-mono text-[var(--c-text)]">{method.id.slice(0, 8)}...</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-[var(--c-text-muted)]">Updated</dt>
                  <dd className="text-[var(--c-text)]">{formatDateTime(method.updated_at)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-[var(--c-text-muted)]">Bank</dt>
                  <dd className="text-[var(--c-text)]">{String(method.bank_name ?? "-")}</dd>
                </div>
              </dl>

              <div className="mt-5 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4">
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Destination</p>
                <div className="space-y-2 text-sm text-[var(--c-text-muted)]">
                  <div className="flex items-center justify-between gap-4">
                    <span>Account Title</span>
                    <span className="text-[var(--c-text)]">{String(method.account_title ?? "-")}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>IBAN / Account No.</span>
                    <span className="font-mono text-[var(--c-text)]">{String(method.iban_or_account_number ?? "-")}</span>
                  </div>
                  <div className="rounded-[var(--r-sm)] border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.12)] px-3 py-3 text-[var(--c-text)]">
                    {String(method.instructions ?? "No instructions provided.")}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <Link href={`/admin/payments/methods/${method.id}`} className="text-sm text-[var(--c-accent)] hover:text-[var(--c-text)]">
                  Update config
                </Link>
                <MethodToggle method={method} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
