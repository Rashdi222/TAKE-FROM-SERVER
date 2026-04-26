"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { superAdminApi } from "@/lib/api";

export interface MatchFilters {
  sport?: string;
  status?: string;
}

export interface AdminMatchesQueryOptions {
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean;
  staleTime?: number;
}

export function useAdminMatches(filters: MatchFilters = {}, options: AdminMatchesQueryOptions = {}) {
  return useQuery({
    queryKey: ["admin", "matches", filters],
    queryFn: () => superAdminApi.matches.list(filters),
    refetchInterval: options.refetchInterval,
    refetchOnWindowFocus: options.refetchOnWindowFocus,
    staleTime: options.staleTime,
  });
}

export function useAdminMatch(id: string) {
  return useQuery({
    queryKey: ["admin", "matches", id],
    queryFn: () => superAdminApi.matches.get(id),
    enabled: !!id,
  });
}

export function useCreateMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.matches.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
    },
  });
}

export function useUpdateMatch(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.matches.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "matches", id] });
    },
  });
}

function lifecycleMutationFactory(action: (id: string) => Promise<unknown>) {
  return function useLifecycleMutation(id: string) {
    const queryClient = useQueryClient();

    return useMutation({
      mutationFn: () => action(id),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
        queryClient.invalidateQueries({ queryKey: ["admin", "matches", id] });
        queryClient.invalidateQueries({ queryKey: ["admin", "odds", id] });
      },
    });
  };
}

export const useStartLiveMatch = lifecycleMutationFactory(superAdminApi.matches.startLive);
export const useCloseMatch = lifecycleMutationFactory(superAdminApi.matches.close);
export const useCancelMatch = lifecycleMutationFactory(superAdminApi.matches.cancel);

export function useSettleMatch(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (winner: string) => superAdminApi.matches.settle(id, { winner }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "matches", id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "odds", id] });
    },
  });
}
