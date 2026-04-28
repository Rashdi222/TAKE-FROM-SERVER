"use client";

import { PaymentMethodEditorForm } from "@/components/payments/PaymentMethodEditorForm";
import { useConfigurePaymentMethod, useUploadPaymentMethodLogo } from "@/hooks/useSuperAdmin";

export default function CreatePaymentMethodPage() {
  const configureMethod = useConfigurePaymentMethod();
  const uploadLogo = useUploadPaymentMethodLogo();

  return (
    <PaymentMethodEditorForm
      title="Configure Payment Method"
      description="Create a structured payment destination with explicit banking details. Raw JSON configuration has been removed from this flow."
      backHref="/admin/payments/methods"
      submitLabel="Save Method"
      isPending={configureMethod.isPending}
      onUploadLogo={(body) => uploadLogo.mutateAsync(body) as Promise<{ data?: { logo_path?: string } } | { logo_path?: string }>}
      onSubmit={(values) => configureMethod.mutateAsync(values).then(() => undefined)}
    />
  );
}
