"use client";

import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PaymentMethodEditorForm } from "@/components/payments/PaymentMethodEditorForm";
import type { PaymentMethod } from "@/lib/api";
import { useSuperAdminPaymentMethod, useUpdatePaymentMethod, useUploadPaymentMethodLogo } from "@/hooks/useSuperAdmin";

export default function EditPaymentMethodPage() {
  const params = useParams<{ id: string }>();
  const methodId = String(params?.id ?? "");
  const { data, isLoading, isError } = useSuperAdminPaymentMethod(methodId);
  const updateMethod = useUpdatePaymentMethod();
  const uploadLogo = useUploadPaymentMethodLogo();
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
      description="Update the existing structured payment destination without leaving the admin payments workspace."
      backHref="/admin/payments/methods"
      submitLabel="Update Method"
      initialMethod={method}
      isPending={updateMethod.isPending}
      onUploadLogo={(body) => uploadLogo.mutateAsync(body) as Promise<{ data?: { logo_path?: string } } | { logo_path?: string }>}
      onSubmit={(values) => updateMethod.mutateAsync({ id: methodId, body: values }).then(() => undefined)}
    />
  );
}
