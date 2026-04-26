import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { userApi } from "@/lib/api";
import type { CreateBetRequest } from "@/lib/api/types/bets";

export function useBets() {
  return useQuery({
    queryKey: ["bets"],
    queryFn: () => userApi.bets.list(),
  });
}

export function useBet(id: string) {
  return useQuery({
    queryKey: ["bet", id],
    queryFn: () => userApi.bets.get(id),
    enabled: !!id,
  });
}

export function useCreateBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateBetRequest) => userApi.bets.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bets"] });
      queryClient.invalidateQueries({ queryKey: ["user", "balance"] });
    },
  });
}

export function useCancelBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => userApi.bets.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bets"] });
      queryClient.invalidateQueries({ queryKey: ["user", "balance"] });
    },
  });
}
