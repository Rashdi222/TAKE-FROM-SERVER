import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { userApi } from "@/lib/api";

export function usePaymentMethods(purpose?: "deposit" | "withdrawal") {
  return useQuery({
    queryKey: ["payments", "methods", purpose ?? "all"],
    queryFn: () => userApi.payments.methods(purpose ? { purpose } : undefined),
  });
}

export function usePaymentSupportContacts() {
  return useQuery({
    queryKey: ["payments", "support-contacts"],
    queryFn: () => userApi.payments.supportContacts(),
  });
}

export function usePaymentTransactions() {
  return useQuery({
    queryKey: ["payments", "transactions"],
    queryFn: () => userApi.payments.transactions(),
  });
}

export function useUploadDepositReceipt() {
  return useMutation({
    mutationFn: (body: FormData) => userApi.payments.uploadDepositReceipt(body),
  });
}

export function useDeposit() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (body: { amount: number; payment_method_id: string; receipt_path: string }) => userApi.payments.deposit(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments", "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["user", "balance"] });
    },
  });
}

export function useWithdraw() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (body: { amount: number; payment_method_id: string; account_title: string; account_number: string }) =>
      userApi.payments.withdraw(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments", "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["user", "balance"] });
    },
  });
}
