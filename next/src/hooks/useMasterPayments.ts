import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { masterAdminApi } from "@/lib/api";

export function useMasterPaymentMethods() {
  return useQuery({
    queryKey: ["master", "payment-methods"],
    queryFn: () => masterAdminApi.payments.methods(),
  });
}

export function useMasterPaymentSupportContacts() {
  return useQuery({
    queryKey: ["master", "payment-support-contacts"],
    queryFn: () => masterAdminApi.payments.supportContacts(),
  });
}

export function useMasterPaymentMethod(id: string) {
  return useQuery({
    queryKey: ["master", "payment-methods", id],
    queryFn: () => masterAdminApi.payments.method(id),
    enabled: Boolean(id),
  });
}

export function useConfigureMasterPaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => masterAdminApi.payments.configureMethod(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master", "payment-methods"] });
    },
  });
}

export function useUploadMasterPaymentMethodLogo() {
  return useMutation({
    mutationFn: (body: FormData) => masterAdminApi.payments.uploadMethodLogo(body),
  });
}

export function useUpdateMasterPaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      masterAdminApi.payments.updateMethod(id, body),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["master", "payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["master", "payment-methods", vars.id] });
    },
  });
}

export function useSetMasterPaymentMethodActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? masterAdminApi.payments.activateMethod(id) : masterAdminApi.payments.deactivateMethod(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master", "payment-methods"] });
    },
  });
}

export function useMasterPaymentApprovals() {
  return useQuery({
    queryKey: ["master", "payment-approvals"],
    queryFn: () => masterAdminApi.payments.approvals(),
  });
}

export function useMasterPaymentTransactions() {
  return useQuery({
    queryKey: ["master", "payment-transactions"],
    queryFn: () => masterAdminApi.payments.transactions(),
  });
}

export function useMasterPaymentApprovalSummary() {
  return useQuery({
    queryKey: ["master", "payment-approvals", "summary"],
    queryFn: () => masterAdminApi.payments.approvalSummary(),
  });
}

export function useMasterApproveDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => masterAdminApi.payments.approveDeposit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master", "payment-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["master", "payment-approvals", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["master", "dashboard"] });
    },
  });
}

export function useMasterRejectDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      masterAdminApi.payments.rejectDeposit(id, reason ? { reason } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master", "payment-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["master", "payment-approvals", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["master", "dashboard"] });
    },
  });
}

export function useMasterApproveWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => masterAdminApi.payments.approveWithdrawal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master", "payment-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["master", "payment-approvals", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["master", "dashboard"] });
    },
  });
}

export function useMasterRejectWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      masterAdminApi.payments.rejectWithdrawal(id, reason ? { reason } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master", "payment-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["master", "payment-approvals", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["master", "dashboard"] });
    },
  });
}
