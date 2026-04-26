import { useQuery } from "@tanstack/react-query";
import { userApi } from "@/lib/api";

export function useProfile() {
  return useQuery({
    queryKey: ["user", "profile"],
    queryFn: () => userApi.profile.get(),
  });
}

export function useBalance() {
  return useQuery({
    queryKey: ["user", "balance"],
    queryFn: () => userApi.profile.balance(),
  });
}

export function useWalletMode() {
  return useQuery({
    queryKey: ["user", "wallet-mode"],
    queryFn: async () => {
      const response = await userApi.profile.get();
      return response.data?.wallet_mode ?? "self_service";
    },
  });
}

export function useAccountTransactions() {
  return useQuery({
    queryKey: ["user", "transactions"],
    queryFn: () => userApi.profile.transactions(),
  });
}
