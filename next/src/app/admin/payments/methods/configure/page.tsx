"use client";

import { PaymentMethodEditorForm } from "@/components/payments/PaymentMethodEditorForm";
import { useConfigurePaymentMethod, useUploadPaymentMethodLogo } from "@/hooks/useSuperAdmin";

export default function ConfigurePaymentMethodPage() {
  const configureMethod = useConfigurePaymentMethod();
  const uploadLogo = useUploadPaymentMethodLogo();

  return (
    <PaymentMethodEditorForm
      title="Configure Payment Method"
      description="Create a structured payment destination with explicit banking details. Raw JSON configuration has been removed from this flow."
      backHref="/admin/payments/methods"
      submitLabel="Save Method"
      isPending={configureMethod.isPending}
      onUploadLogo={(body) => uploadLogo.mutateAsync(body)}
      onSubmit={(values) => configureMethod.mutateAsync(values).then(() => undefined)}
    />
  );
}
