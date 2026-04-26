import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { superAdminApi } from "@/lib/api";

type BetFilters = {
  status?: string;
  match_id?: string;
};

type ProviderFilters = Record<string, string | number | boolean | null | undefined>;
type AdminQueryOptions = { enabled?: boolean };

export function useSuperAdminDashboard() {
  return useQuery({
    queryKey: ["super-admin", "dashboard"],
    queryFn: () => superAdminApi.dashboard(),
  });
}

export function useSuperAdminMasterAdmins(filters?: Record<string, string | undefined>) {
  return useQuery({
    queryKey: ["super-admin", "master-admins", filters ?? {}],
    queryFn: () => superAdminApi.masterAdmins.list(filters),
  });
}

export function useSuperAdminMasterAdmin(id: string) {
  return useQuery({
    queryKey: ["super-admin", "master-admin", id],
    queryFn: () => superAdminApi.masterAdmins.get(id),
    enabled: !!id,
  });
}

export function useSuperAdminMasterAdminStats(id: string) {
  return useQuery({
    queryKey: ["super-admin", "master-admin", id, "stats"],
    queryFn: () => superAdminApi.masterAdmins.stats(id),
    enabled: !!id,
  });
}

export function useCreateMasterAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.masterAdmins.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "master-admins"] });
    },
  });
}

export function useTopupMasterAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number | string }) =>
      superAdminApi.masterAdmins.topup(id, { amount }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "master-admins"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "master-admin", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "master-admin", vars.id, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "dashboard"] });
    },
  });
}

export function useDeductMasterAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number | string }) =>
      superAdminApi.masterAdmins.deduct(id, { amount }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "master-admins"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "master-admin", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "master-admin", vars.id, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "dashboard"] });
    },
  });
}

export function useSuperAdminPlayers(filters?: Record<string, string | undefined>) {
  return useQuery({
    queryKey: ["super-admin", "players", filters ?? {}],
    queryFn: () => superAdminApi.users.players(filters),
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.users.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "players"] });
    },
  });
}

export function useRiskControls() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      superAdminApi.users.riskControls(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "players"] });
    },
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.users.revokeSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "players"] });
    },
  });
}

export function useSuperAdminBets(filters: BetFilters) {
  return useQuery({
    queryKey: ["super-admin", "bets", filters],
    queryFn: () => superAdminApi.bets.adminIndex(filters),
  });
}

export function useSuperAdminPaymentMethods() {
  return useQuery({
    queryKey: ["super-admin", "payment-methods"],
    queryFn: () => superAdminApi.payments.methods(),
  });
}

export function useSuperAdminPaymentMethod(id: string) {
  return useQuery({
    queryKey: ["super-admin", "payment-methods", id],
    queryFn: () => superAdminApi.payments.method(id),
    enabled: Boolean(id),
  });
}

export function useConfigurePaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.payments.configure(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-methods"] });
    },
  });
}

export function useUploadPaymentMethodLogo() {
  return useMutation({
    mutationFn: (body: FormData) => superAdminApi.payments.uploadMethodLogo(body),
  });
}

export function useUpdatePaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      superAdminApi.payments.updateMethod(id, body),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-methods", vars.id] });
    },
  });
}

export function useSetPaymentMethodActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? superAdminApi.payments.activateMethod(id) : superAdminApi.payments.deactivateMethod(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-methods"] });
    },
  });
}

export function useSuperAdminPaymentTransactions() {
  return useQuery({
    queryKey: ["super-admin", "payment-transactions"],
    queryFn: () => superAdminApi.payments.transactions(),
  });
}

export function useSuperAdminPaymentApprovals() {
  return useQuery({
    queryKey: ["super-admin", "payment-approvals"],
    queryFn: () => superAdminApi.payments.approvals(),
  });
}

export function useSuperAdminPaymentApprovalSummary() {
  return useQuery({
    queryKey: ["super-admin", "payment-approvals", "summary"],
    queryFn: () => superAdminApi.payments.approvalSummary(),
  });
}

export function useMultiSourceHealth() {
  return useQuery({
    queryKey: ["super-admin", "multi-source", "health"],
    queryFn: () => superAdminApi.multiSource.health(),
    refetchInterval: 10_000,
  });
}

export function useMultiSourceAutomationStatus() {
  return useQuery({
    queryKey: ["super-admin", "multi-source", "automation-status"],
    queryFn: () => superAdminApi.multiSource.automationStatus(),
    refetchInterval: 10_000,
  });
}

export function useMultiSourceAutomationEvents(limit: number = 50) {
  return useQuery({
    queryKey: ["super-admin", "multi-source", "automation-events", limit],
    queryFn: () => superAdminApi.multiSource.automationEvents({ limit }),
    refetchInterval: 10_000,
  });
}

export function useInjectTestSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body?: Record<string, unknown>) => superAdminApi.multiSource.injectTestSuggestion(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "health"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "match-suggestions"] });
    },
  });
}

export function useScraperConfigurations() {
  return useQuery({
    queryKey: ["super-admin", "multi-source", "scraper-configurations"],
    queryFn: () => superAdminApi.multiSource.scraperConfigurations(),
    refetchInterval: 10_000,
  });
}

export function useEgressGateways() {
  return useQuery({
    queryKey: ["super-admin", "multi-source", "gateways"],
    queryFn: () => superAdminApi.multiSource.gateways(),
    refetchInterval: 10_000,
  });
}

export function useCricketPollingProfiles(refetchInterval: number = 15_000) {
  return useQuery({
    queryKey: ["super-admin", "multi-source", "polling-profiles"],
    queryFn: () => superAdminApi.multiSource.pollingProfiles(),
    refetchInterval,
  });
}

export function useCreateEgressGateway() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.multiSource.createGateway(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "gateways"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "scraper-configurations"] });
    },
  });
}

export function useUpdateEgressGateway() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      superAdminApi.multiSource.updateGateway(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "gateways"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "scraper-configurations"] });
    },
  });
}

export function useDeleteEgressGateway() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.multiSource.deleteGateway(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "gateways"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "scraper-configurations"] });
    },
  });
}

export function useCreateScraperConfiguration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.multiSource.createScraperConfiguration(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "scraper-configurations"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "polling-profiles"] });
    },
  });
}

export function useUpdateScraperConfiguration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      superAdminApi.multiSource.updateScraperConfiguration(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "scraper-configurations"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "polling-profiles"] });
    },
  });
}

export function useDeleteScraperConfiguration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.multiSource.deleteScraperConfiguration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "scraper-configurations"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "polling-profiles"] });
    },
  });
}

export function useReplayScraperConfigurations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => superAdminApi.multiSource.replayScraperConfigurations(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "scraper-configurations"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "health"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "polling-profiles"] });
    },
  });
}

export function useReplayScraperConfiguration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.multiSource.replayScraperConfiguration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "scraper-configurations"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "health"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "polling-profiles"] });
    },
  });
}

export function usePruneInvalidMatchSuggestions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => superAdminApi.multiSource.pruneInvalidSuggestions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "match-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "health"] });
    },
  });
}

export function useSourceRefreshAdvisory() {
  return useMutation({
    mutationFn: (matchId: string) => superAdminApi.multiSource.sourceRefreshAdvisory(matchId),
  });
}

export function useFetchSourceNow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (matchId: string) => superAdminApi.multiSource.fetchSourceNow(matchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "polling-profiles"] });
    },
  });
}

export function useApproveWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.payments.approveWithdrawal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-approvals", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "dashboard"] });
    },
  });
}

export function useApproveDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.payments.approveDeposit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-approvals", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "dashboard"] });
    },
  });
}

export function useRejectDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      superAdminApi.payments.rejectDeposit(id, reason ? { reason } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-approvals", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "dashboard"] });
    },
  });
}

export function useRejectWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      superAdminApi.payments.rejectWithdrawal(id, reason ? { reason } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "payment-approvals", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "dashboard"] });
    },
  });
}

export function useSuperAdminReportStats() {
  return useQuery({
    queryKey: ["super-admin", "reports", "stats"],
    queryFn: () => superAdminApi.reports.stats(),
  });
}

export function useSuperAdminDailyReport(date?: string) {
  return useQuery({
    queryKey: ["super-admin", "reports", "daily", date ?? "today"],
    queryFn: () => superAdminApi.reports.daily(date ? { date } : undefined),
  });
}

export function useSuperAdminWeeklyReport() {
  return useQuery({
    queryKey: ["super-admin", "reports", "weekly"],
    queryFn: () => superAdminApi.reports.weekly(),
  });
}

export function useSuperAdminMonthlyReport() {
  return useQuery({
    queryKey: ["super-admin", "reports", "monthly"],
    queryFn: () => superAdminApi.reports.monthly(),
  });
}

export function useSuperAdminMasterAdminReports(filters?: Record<string, string | undefined>) {
  return useQuery({
    queryKey: ["super-admin", "reports", "master-admins", filters ?? {}],
    queryFn: () => superAdminApi.reports.masterAdmins(filters),
  });
}

export function useSuperAdminCricketQuoteCalibration(limit = 60) {
  return useQuery({
    queryKey: ["super-admin", "reports", "cricket-quote-calibration", limit],
    queryFn: () => superAdminApi.reports.cricketQuoteCalibration({ limit }),
  });
}

export function useSuperAdminProviders() {
  return useQuery({
    queryKey: ["super-admin", "providers"],
    queryFn: () => superAdminApi.providers.list(),
  });
}

export function useSuperAdminProviderHealth() {
  return useQuery({
    queryKey: ["super-admin", "providers", "health"],
    queryFn: () => superAdminApi.providers.health(),
  });
}

export function useSuperAdminProviderSyncLogs(filters?: ProviderFilters) {
  return useQuery({
    queryKey: ["super-admin", "providers", "sync-logs", filters ?? {}],
    queryFn: () => superAdminApi.providers.syncLogs(filters),
  });
}

export function useCricketCompetitionDiscovery(filters?: ProviderFilters) {
  return useQuery({
    queryKey: ["super-admin", "cricket", "discovery", filters ?? {}],
    queryFn: () => superAdminApi.providers.cricketDiscovery(filters),
  });
}

export function useCricketAiObservability(
  matchId?: string,
  opts?: { enabled?: boolean; refetchInterval?: number },
) {
  return useQuery({
    queryKey: ["super-admin", "cricket", "ai-observability", matchId ?? "all"],
    queryFn: () =>
      superAdminApi.providers.cricketAiObservability(
        matchId ? { match_id: matchId } : undefined,
      ),
    enabled: opts?.enabled ?? true,
    refetchInterval: opts?.refetchInterval ?? 10_000,
  });
}

export function useFootballCompetitionDiscovery(filters?: ProviderFilters, opts?: AdminQueryOptions) {
  return useQuery({
    queryKey: ["super-admin", "football", "discovery", filters ?? {}],
    queryFn: () => superAdminApi.providers.footballDiscovery(filters),
    enabled: opts?.enabled ?? true,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

export function useRefreshFootballCompetitionDiscovery(filters?: ProviderFilters) {
  const queryClient = useQueryClient();
  const queryKey = ["super-admin", "football", "discovery", filters ?? {}] as const;

  return useMutation({
    mutationFn: () => superAdminApi.providers.footballDiscovery({ ...(filters ?? {}), force_refresh: true }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });
}

export function useResolveCricketSeason() {
  return useMutation({
    mutationFn: (leagueId: string) =>
      superAdminApi.providers.resolveCricketSeason({ league_id: leagueId }),
  });
}

export function useCricketAutomationRuns(matchIds: string[]) {
  const query = matchIds.length ? { match_ids: matchIds.join(",") } : undefined;

  return useQuery({
    queryKey: ["super-admin", "cricket", "automation-runs", query ?? {}],
    queryFn: () => superAdminApi.providers.cricketAutomationRuns(query),
    enabled: matchIds.length > 0,
  });
}

export function useFootballAutomationRuns(matchIds: string[]) {
  const query = matchIds.length ? { match_ids: matchIds.join(",") } : undefined;

  return useQuery({
    queryKey: ["super-admin", "football", "automation-runs", query ?? {}],
    queryFn: () => superAdminApi.providers.footballAutomationRuns(query),
    enabled: matchIds.length > 0,
  });
}

export function useCompetitionFeeds(filters?: ProviderFilters) {
  return useQuery({
    queryKey: ["super-admin", "competition-feeds", filters ?? {}],
    queryFn: () => superAdminApi.providers.competitionFeeds(filters),
  });
}

export function useCompetitionFeed(id: string) {
  return useQuery({
    queryKey: ["super-admin", "competition-feed", id],
    queryFn: () => superAdminApi.providers.competitionFeed(id),
    enabled: !!id,
  });
}

export function useCompetitionFeedMetrics(id: string) {
  return useQuery({
    queryKey: ["super-admin", "competition-feed", id, "metrics"],
    queryFn: () => superAdminApi.providers.competitionFeedMetrics(id),
    enabled: !!id,
  });
}

export function useUpsertProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.providers.upsert(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "providers"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "providers", "health"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "providers", "sync-logs"] });
    },
  });
}

export function useActivateProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.providers.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "providers"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "providers", "health"] });
    },
  });
}

export function useEnableProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      superAdminApi.providers.enable(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "providers"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "providers", "health"] });
    },
  });
}

export function useDeleteProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.providers.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "providers"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feeds"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "providers", "health"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "providers", "sync-logs"] });
    },
  });
}

export function useSyncProviderNow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body?: Record<string, unknown>) => superAdminApi.providers.syncNow(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "providers", "health"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "providers", "sync-logs"] });
    },
  });
}

export function useMultiSourceMatchSuggestions(filters?: ProviderFilters) {
  return useQuery({
    queryKey: ["super-admin", "multi-source", "match-suggestions", filters ?? {}],
    queryFn: () => superAdminApi.multiSource.suggestions(filters),
  });
}

export function useMultiSourceCanonicalMatches(filters?: ProviderFilters, opts?: AdminQueryOptions) {
  return useQuery({
    queryKey: ["super-admin", "multi-source", "canonical-matches", filters ?? {}],
    queryFn: () => superAdminApi.multiSource.canonicalMatches(filters),
    enabled: opts?.enabled ?? true,
  });
}

export function useApproveMatchSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sourceName,
      sourceMatchId,
      body,
    }: {
      sourceName: string;
      sourceMatchId: string;
      body: Record<string, unknown>;
    }) => superAdminApi.multiSource.approveSuggestion(sourceName, sourceMatchId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "match-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "canonical-matches"] });
    },
  });
}

export function useRejectMatchSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sourceName,
      sourceMatchId,
      body,
    }: {
      sourceName: string;
      sourceMatchId: string;
      body: Record<string, unknown>;
    }) => superAdminApi.multiSource.rejectSuggestion(sourceName, sourceMatchId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "match-suggestions"] });
    },
  });
}

export function useManualLinkMatchSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sourceName,
      sourceMatchId,
      body,
    }: {
      sourceName: string;
      sourceMatchId: string;
      body: Record<string, unknown>;
    }) => superAdminApi.multiSource.manualLinkSuggestion(sourceName, sourceMatchId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "match-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "multi-source", "canonical-matches"] });
    },
  });
}

export function useCreateCompetitionFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.providers.createCompetitionFeed(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feeds"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feed"] });
    },
  });
}

export function useDeleteCompetitionFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.providers.deleteCompetitionFeed(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feeds"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feed"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "cricket", "discovery"] });
    },
  });
}

export function useRefreshCricketCompetitionDiscovery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => superAdminApi.providers.cricketDiscovery({ force_refresh: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "cricket", "discovery"] });
    },
  });
}

export function useUpdateCompetitionFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      superAdminApi.providers.updateCompetitionFeed(id, body),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feeds"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feed", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feed", variables.id, "metrics"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "cricket", "automation-runs"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "football", "automation-runs"] });
    },
  });
}

export function useEnableCompetitionFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      superAdminApi.providers.enableCompetitionFeed(id, { enabled }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feeds"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feed", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feed", variables.id, "metrics"] });
    },
  });
}

export function useImportCompetitionFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.providers.importCompetitionFeed(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feeds"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feed", id] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feed", id, "metrics"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "cricket", "automation-runs"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "football", "automation-runs"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "providers", "sync-logs"] });
    },
  });
}

export function useRefreshCompetitionFeedUpcoming() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.providers.refreshCompetitionFeedUpcoming(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feeds"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feed", id] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feed", id, "metrics"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "cricket", "automation-runs"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "football", "automation-runs"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "providers", "sync-logs"] });
    },
  });
}

export function useRefreshCompetitionFeedLive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.providers.refreshCompetitionFeedLive(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feeds"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feed", id] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "competition-feed", id, "metrics"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "cricket", "automation-runs"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "football", "automation-runs"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "providers", "sync-logs"] });
    },
  });
}

export function useEmergencySuspendMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: Record<string, unknown> }) =>
      superAdminApi.matches.emergencySuspend(id, body),
    onSuccess: (_result, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "match", vars.id] });
    },
  });
}

export function useEmergencyResumeMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: Record<string, unknown> }) =>
      superAdminApi.matches.emergencyResume(id, body),
    onSuccess: (_result, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "match", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "odds", vars.id] });
    },
  });
}

export function useEmergencySuspendAllCricket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body?: Record<string, unknown>) => superAdminApi.matches.emergencySuspendAllCricket(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
    },
  });
}

export function useSuspendCricketMarket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, marketKey, body }: { id: string; marketKey: string; body?: Record<string, unknown> }) =>
      superAdminApi.matches.suspendMarket(id, marketKey, body),
    onSuccess: (_result, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "odds", vars.id] });
    },
  });
}

export function useSuspendMatchMarket() {
  return useSuspendCricketMarket();
}

export function useResumeCricketMarket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, marketKey, body }: { id: string; marketKey: string; body?: Record<string, unknown> }) =>
      superAdminApi.matches.resumeMarket(id, marketKey, body),
    onSuccess: (_result, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "odds", vars.id] });
    },
  });
}

export function useResumeMatchMarket() {
  return useResumeCricketMarket();
}

export function useForceCricketReprice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => superAdminApi.matches.forceReprice(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "odds", id] });
    },
  });
}

export function useForceMatchReprice() {
  return useForceCricketReprice();
}

export function useManualOverridePublish() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      superAdminApi.matches.manualOverridePublish(id, body),
    onSuccess: (_result, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "match", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "odds", vars.id] });
    },
  });
}

export function useSportsDataEvents(filters?: ProviderFilters) {
  return useQuery({
    queryKey: ["super-admin", "sports-data", "events", filters ?? {}],
    queryFn: () => superAdminApi.sportsData.events(filters),
  });
}

export function useSportsDataSyncLogs(filters?: ProviderFilters) {
  return useQuery({
    queryKey: ["super-admin", "sports-data", "sync-logs", filters ?? {}],
    queryFn: () => superAdminApi.sportsData.syncLogs(filters),
  });
}

export function useSportsDataRejections(filters?: ProviderFilters) {
  return useQuery({
    queryKey: ["super-admin", "sports-data", "rejections", filters ?? {}],
    queryFn: () => superAdminApi.sportsData.rejections(filters),
  });
}

export function useSportsDataBackfill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.sportsData.backfill(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "sports-data", "sync-logs"] });
    },
  });
}

export function useReplaySportsDataRejections() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body?: Record<string, unknown>) => superAdminApi.sportsData.replayRejections(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "sports-data", "rejections"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "sports-data", "sync-logs"] });
    },
  });
}

export function useOpenRouterModels(forceRefreshKey = 0) {
  return useQuery({
    queryKey: ["super-admin", "settings", "openrouter-models", forceRefreshKey],
    queryFn: () =>
      superAdminApi.settings.openrouterModels(
        forceRefreshKey ? { refresh: true } : undefined
      ),
  });
}

export function useOpenRouterSettings() {
  return useQuery({
    queryKey: ["super-admin", "settings", "openrouter"],
    queryFn: () => superAdminApi.settings.openrouterSettings(),
  });
}

export function useSetOpenRouterModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.settings.setOpenrouterModel(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "settings", "openrouter"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "settings", "openrouter-models"] });
    },
  });
}

export function useSetOpenRouterKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.settings.setOpenrouterKey(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "settings", "openrouter"] });
    },
  });
}

export function useAccountCurrencies() {
  return useQuery({
    queryKey: ["super-admin", "settings", "account-currencies"],
    queryFn: () => superAdminApi.settings.accountCurrencies(),
  });
}

export function useUpdateAccountCurrencies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.settings.updateAccountCurrencies(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "settings", "account-currencies"] });
    },
  });
}

export function useLandingWhatsappSettings() {
  return useQuery({
    queryKey: ["super-admin", "settings", "landing-whatsapp"],
    queryFn: () => superAdminApi.settings.landingWhatsapp(),
  });
}

export function useUpdateLandingWhatsappSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.settings.updateLandingWhatsapp(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "settings", "landing-whatsapp"] });
    },
  });
}
