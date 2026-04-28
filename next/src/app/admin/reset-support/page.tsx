"use client";

import {
  useCreateSuperAdminResetSupportContact,
  useDeleteSuperAdminResetSupportContact,
  useSuperAdminResetSupportContacts,
  useUpdateSuperAdminResetSupportContact,
} from "@/hooks/useResetSupport";
import { ResetSupportManager } from "@/components/support-reset/ResetSupportManager";

export default function AdminResetSupportPage() {
  const { data, isLoading } = useSuperAdminResetSupportContacts();
  const createContact = useCreateSuperAdminResetSupportContact();
  const updateContact = useUpdateSuperAdminResetSupportContact();
  const deleteContact = useDeleteSuperAdminResetSupportContact();

  return (
    <ResetSupportManager
      title="Global Reset Support"
      description="Manage the support contacts shown to direct site users when they use the forgot-password lookup flow."
      contacts={(data as { data?: import("@/lib/api/types/resetSupport").ResetSupportContact[] } | undefined)?.data ?? []}
      isLoading={isLoading}
      createContact={(body) => createContact.mutateAsync(body)}
      updateContact={(id, body) => updateContact.mutateAsync({ id, body })}
      deleteContact={(id) => deleteContact.mutateAsync(id)}
    />
  );
}
