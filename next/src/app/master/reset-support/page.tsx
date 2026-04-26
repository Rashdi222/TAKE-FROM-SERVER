"use client";

import {
  useCreateMasterAdminResetSupportContact,
  useDeleteMasterAdminResetSupportContact,
  useMasterAdminResetSupportContacts,
  useUpdateMasterAdminResetSupportContact,
} from "@/hooks/useResetSupport";
import { ResetSupportManager } from "@/components/support-reset/ResetSupportManager";

export default function MasterResetSupportPage() {
  const { data, isLoading } = useMasterAdminResetSupportContacts();
  const createContact = useCreateMasterAdminResetSupportContact();
  const updateContact = useUpdateMasterAdminResetSupportContact();
  const deleteContact = useDeleteMasterAdminResetSupportContact();

  return (
    <ResetSupportManager
      title="Player Reset Support"
      description="Manage the contacts shown to your players when they use forgot-password lookup by phone number."
      contacts={data?.data ?? []}
      isLoading={isLoading}
      createContact={(body) => createContact.mutateAsync(body)}
      updateContact={(id, body) => updateContact.mutateAsync({ id, body })}
      deleteContact={(id) => deleteContact.mutateAsync(id)}
    />
  );
}
