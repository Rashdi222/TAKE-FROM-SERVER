import { useQuery } from "@tanstack/react-query";
import { masterAdminApi } from "@/lib/api";

export function useMasterReports(filters?: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ["master", "reports", filters ?? {}],
    queryFn: () => masterAdminApi.reports.my(filters),
  });
}

export function useMasterLedger(filters?: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ["master", "reports", "ledger", filters ?? {}],
    queryFn: () => masterAdminApi.reports.ledger(filters),
  });
}

export function useMasterTransactions() {
  return useQuery({
    queryKey: ["master", "transactions"],
    queryFn: () => masterAdminApi.transactions(),
  });
}
