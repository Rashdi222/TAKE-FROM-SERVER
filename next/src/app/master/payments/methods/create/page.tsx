"use client";

import { PaymentMethodEditorForm } from "@/components/payments/PaymentMethodEditorForm";
import { useConfigureMasterPaymentMethod, useUploadMasterPaymentMethodLogo } from "@/hooks/useMasterPayments";

export default function CreateMasterPaymentMethodPage() {
  const configureMethod = useConfigureMasterPaymentMethod();
  const uploadLogo = useUploadMasterPaymentMethodLogo();

  return (
    <PaymentMethodEditorForm
      title="Configure Payment Method"
      description="Define the exact payment destination details your managed players will use. This configuration is scoped to your account only."
      backHref="/master/payments/methods"
      submitLabel="Save Method"
      isPending={configureMethod.isPending}
      onUploadLogo={(body) => uploadLogo.mutateAsync(body) as Promise<{ data?: { logo_path?: string } } | { logo_path?: string }>}
      onSubmit={(values) => configureMethod.mutateAsync(values).then(() => undefined)}
    />
  );
}
