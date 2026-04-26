import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { masterAdminApi } from "@/lib/api";

export function useMasterPlayers() {
  return useQuery({
    queryKey: ["master", "players"],
    queryFn: () => masterAdminApi.players.list(),
  });
}

export function useMasterPlayer(id: string) {
  return useQuery({
    queryKey: ["master", "player", id],
    queryFn: async () => {
      const response = (await masterAdminApi.players.list()) as {
        data?: Array<Record<string, unknown> & { id: string }>;
      };

      return response.data?.find((player) => player.id === id) ?? null;
    },
    enabled: !!id,
  });
}

export function useMasterPlayerLedger(
  id: string,
  filters?: Record<string, string | number | undefined>,
) {
  return useQuery({
    queryKey: ["master", "player", id, "ledger", filters ?? {}],
    queryFn: () => masterAdminApi.players.ledger(id, filters),
    enabled: !!id,
  });
}

export function useMasterPlayerStats(id: string) {
  return useQuery({
    queryKey: ["master", "player", id, "stats"],
    queryFn: () => masterAdminApi.players.stats(id),
    enabled: !!id,
  });
}

export function useMasterPlayerBetsReport(
  id: string,
  filters?: Record<string, string | number | undefined>,
) {
  return useQuery({
    queryKey: ["master", "player", id, "bets-report", filters ?? {}],
    queryFn: () => masterAdminApi.players.betsReport(id, filters),
    enabled: !!id,
  });
}

export function useMasterPlayerReportExport(
  id: string,
  filters?: Record<string, string | number | undefined>,
) {
  return useQuery({
    queryKey: ["master", "player", id, "report-export", filters ?? {}],
    queryFn: () => masterAdminApi.players.reportExport(id, filters),
    enabled: !!id,
  });
}

export function useCreatePlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => masterAdminApi.players.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master", "players"] });
      queryClient.invalidateQueries({ queryKey: ["master", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["master", "reports"] });
    },
  });
}

export function useTopupPlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      masterAdminApi.players.topup(id, body),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["master", "players"] });
      queryClient.invalidateQueries({ queryKey: ["master", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["master", "player", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["master", "player", vars.id, "ledger"] });
      queryClient.invalidateQueries({ queryKey: ["master", "player", vars.id, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["master", "player", vars.id, "bets-report"] });
      queryClient.invalidateQueries({ queryKey: ["master", "player", vars.id, "report-export"] });
      queryClient.invalidateQueries({ queryKey: ["master", "reports"] });
    },
  });
}

export function useDeductPlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      masterAdminApi.players.deduct(id, body),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["master", "players"] });
      queryClient.invalidateQueries({ queryKey: ["master", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["master", "player", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["master", "player", vars.id, "ledger"] });
      queryClient.invalidateQueries({ queryKey: ["master", "player", vars.id, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["master", "player", vars.id, "bets-report"] });
      queryClient.invalidateQueries({ queryKey: ["master", "player", vars.id, "report-export"] });
      queryClient.invalidateQueries({ queryKey: ["master", "reports"] });
    },
  });
}

export function useSetPlayerPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      masterAdminApi.players.setPassword(id, body),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["master", "player", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["master", "players"] });
    },
  });
}

export function useGeneratePlayerResetLink() {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: Record<string, unknown> }) =>
      masterAdminApi.players.generateResetLink(id, body),
  });
}
