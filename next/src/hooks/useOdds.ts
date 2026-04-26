"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { superAdminApi } from "@/lib/api";
import type {
  OddsSourceType,
  ProviderOddsReferenceResponse,
  SportMarketConfig,
} from "@/lib/api";

export interface OddsFilters {
  visibility_status?: "draft" | "published" | "archived";
  active_only?: "true";
  include_unpublished?: "true";
  source_type?: OddsSourceType;
}

interface AdminOddsQueryOptions {
  refetchInterval?: number;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
}

export function useAdminOdds(
  matchId: string,
  filters: OddsFilters = {},
  options: AdminOddsQueryOptions = {},
) {
  return useQuery({
    queryKey: ["admin", "odds", matchId, filters],
    queryFn: () => superAdminApi.odds.list(matchId, filters),
    enabled: !!matchId,
    refetchInterval: options.refetchInterval,
    staleTime: options.staleTime,
    refetchOnWindowFocus: options.refetchOnWindowFocus,
  });
}

export function useCreateOdds(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.odds.create(matchId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "odds", matchId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "odds", matchId, "provider-reference"] });
    },
  });
}

export function useUpdateOdds(oddsId: string, matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.odds.update(oddsId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "odds", matchId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "odds", matchId, "provider-reference"] });
    },
  });
}

function oddsMutationFactory(
  action: (matchId: string, body?: Record<string, unknown>) => Promise<unknown>,
) {
  return function useOddsMutation(matchId: string) {
    const queryClient = useQueryClient();

    return useMutation({
      mutationFn: (body?: Record<string, unknown>) => action(matchId, body),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "odds", matchId] });
        queryClient.invalidateQueries({ queryKey: ["admin", "matches", matchId] });
        queryClient.invalidateQueries({ queryKey: ["admin", "odds", matchId, "provider-reference"] });
      },
    });
  };
}

export const useGenerateOdds = oddsMutationFactory(superAdminApi.odds.generate);
export const useRegenerateOdds = oddsMutationFactory(superAdminApi.odds.regenerate);
export const usePublishOdds = oddsMutationFactory(superAdminApi.odds.publish);
export const useUnpublishOdds = oddsMutationFactory(superAdminApi.odds.unpublish);
export const useOrchestrateOdds = oddsMutationFactory(superAdminApi.odds.orchestrate);
export const useImportProviderOdds = oddsMutationFactory(superAdminApi.odds.importProviderOdds);

export function useInjectSimulationScenario(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (scenario: string) => superAdminApi.odds.simulate(matchId, { scenario }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "odds", matchId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "matches", matchId] });
    },
  });
}

export function useRewriteOdds(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.odds.rewrite(matchId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "odds", matchId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "matches", matchId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "odds", matchId, "provider-reference"] });
    },
  });
}

export function useProviderReferenceOdds(matchId: string) {
  return useQuery<ProviderOddsReferenceResponse>({
    queryKey: ["admin", "odds", matchId, "provider-reference"],
    queryFn: async () => {
      const response = (await superAdminApi.odds.providerReference(matchId)) as {
        data: ProviderOddsReferenceResponse;
      };

      return response.data;
    },
    enabled: !!matchId,
  });
}

export function useSportMarketConfigs(
  filters: { sport?: string; enabled_only?: "true" } = {},
) {
  return useQuery<SportMarketConfig[]>({
    queryKey: ["admin", "sport-market-configs", filters],
    queryFn: async () => {
      const response = (await superAdminApi.sportMarketConfigs.list(filters)) as {
        data?: SportMarketConfig[];
      };

      return response.data ?? [];
    },
  });
}

export function useUpsertSportMarketConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.sportMarketConfigs.upsert(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "sport-market-configs"] });
    },
  });
}

export function useToggleOddsActive(oddsId: string, matchId: string, isActive: boolean) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      isActive
        ? superAdminApi.odds.deactivate(oddsId)
        : superAdminApi.odds.activate(oddsId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "odds", matchId] });
    },
  });
}
