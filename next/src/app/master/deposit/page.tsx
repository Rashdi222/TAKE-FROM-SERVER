"use client";

import { Card } from "@/components/ui/Card";
import { PaymentSupportContactsCard } from "@/components/payments/PaymentSupportContactsCard";
import { useMasterPaymentSupportContacts } from "@/hooks/useMasterPayments";

export default function MasterDepositPage() {
  const { data } = useMasterPaymentSupportContacts();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Deposit</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Funding Support</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--c-text-muted)]">
          Use these platform support contacts when you need your master-admin balance funded by the super-admin side.
        </p>
      </div>

      <Card variant="surface-1" className="p-5">
        <p className="text-sm leading-6 text-[var(--c-text-muted)]">
          This page does not create a self-service deposit request. It gives you the active platform support contacts configured by super admin so you can request funding directly.
        </p>
      </Card>

      <PaymentSupportContactsCard
        title="Contact platform funding support"
        description="These contacts come from the active super-admin support setup for funding and balance assistance."
        result={(data as { data?: import("@/lib/api/types/resetSupport").ForgotPasswordSupportLookupResponse } | undefined)?.data ?? null}
      />
    </div>
  );
}
