"use client";

import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PaymentMethodEditorForm } from "@/components/payments/PaymentMethodEditorForm";
import type { PaymentMethod } from "@/lib/api";
import { useMasterPaymentMethod, useUpdateMasterPaymentMethod, useUploadMasterPaymentMethodLogo } from "@/hooks/useMasterPayments";

export default function EditMasterPaymentMethodPage() {
  const params = useParams<{ id: string }>();
  const methodId = String(params?.id ?? "");
  const { data, isLoading, isError } = useMasterPaymentMethod(methodId);
  const updateMethod = useUpdateMasterPaymentMethod();
  const uploadLogo = useUploadMasterPaymentMethodLogo();
  const method = ((data as { data?: PaymentMethod } | undefined)?.data ?? null) as PaymentMethod | null;

  if (isLoading) {
    return <Card variant="surface-1" className="p-8 text-center text-[var(--c-text-muted)]">Loading payment method...</Card>;
  }

  if (isError || !method) {
    return <Card variant="surface-1" className="p-8 text-center text-[var(--c-danger)]">Payment method could not be loaded.</Card>;
  }

  return (
    <PaymentMethodEditorForm
      title="Edit Payment Method"
      description="Update the payment destination your managed players see, without recreating the method."
      backHref="/master/payments/methods"
      submitLabel="Update Method"
      initialMethod={method}
      isPending={updateMethod.isPending}
      onUploadLogo={(body) => uploadLogo.mutateAsync(body)}
      onSubmit={(values) => updateMethod.mutateAsync({ id: methodId, body: values }).then(() => undefined)}
    />
  );
}
