import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { masterAdminApi, publicApi, superAdminApi } from "@/lib/api";

export function useForgotPasswordSupportLookup() {
  return useMutation({
    mutationFn: (body: { phone_number?: string; email?: string }) => publicApi.auth.forgotPasswordSupport(body),
  });
}

export function useSuperAdminResetSupportContacts() {
  return useQuery({
    queryKey: ["super-admin", "reset-support", "contacts"],
    queryFn: () => superAdminApi.resetSupport.list(),
  });
}

export function useCreateSuperAdminResetSupportContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.resetSupport.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "reset-support", "contacts"] });
    },
  });
}

export function useUpdateSuperAdminResetSupportContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      superAdminApi.resetSupport.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "reset-support", "contacts"] });
    },
  });
}

export function useDeleteSuperAdminResetSupportContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.resetSupport.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "reset-support", "contacts"] });
    },
  });
}

export function useMasterAdminResetSupportContacts() {
  return useQuery({
    queryKey: ["master-admin", "reset-support", "contacts"],
    queryFn: () => masterAdminApi.resetSupport.list(),
  });
}

export function useCreateMasterAdminResetSupportContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => masterAdminApi.resetSupport.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master-admin", "reset-support", "contacts"] });
    },
  });
}

export function useUpdateMasterAdminResetSupportContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      masterAdminApi.resetSupport.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master-admin", "reset-support", "contacts"] });
    },
  });
}

export function useDeleteMasterAdminResetSupportContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => masterAdminApi.resetSupport.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master-admin", "reset-support", "contacts"] });
    },
  });
}
