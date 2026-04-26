import { request } from "../http";
import type { QueryParams } from "../http";

export const superAdminApi = {
  dashboard: () => request("GET", "/api/super-admin/dashboard", { auth: true }),
  masterAdmins: {
    list: (query?: QueryParams) => request("GET", "/api/super-admin/master-admins", { auth: true, query }),
    create: (body: Record<string, unknown>) => request("POST", "/api/super-admin/master-admins", { auth: true, body }),
    get: (id: string) => request("GET", `/api/super-admin/master-admins/${id}`, { auth: true }),
    stats: (id: string) => request("GET", `/api/super-admin/master-admins/${id}/stats`, { auth: true }),
    topup: (id: string, body: Record<string, unknown>) =>
      request("POST", `/api/super-admin/master-admins/${id}/topup`, { auth: true, body }),
    deduct: (id: string, body: Record<string, unknown>) =>
      request("POST", `/api/super-admin/master-admins/${id}/deduct`, { auth: true, body }),
  },
  transfers: {
    transfer: (body: Record<string, unknown>) => request("POST", "/api/super-admin/transfer", { auth: true, body }),
    manualPayment: (body: Record<string, unknown>) =>
      request("POST", "/api/super-admin/manual-payment", { auth: true, body }),
  },
  users: {
    players: (query?: QueryParams) => request("GET", "/api/super-admin/players", { auth: true, query }),
    deactivate: (id: string) => request("DELETE", `/api/super-admin/users/${id}`, { auth: true }),
    riskControls: (id: string, body: Record<string, unknown>) =>
      request("POST", `/api/super-admin/users/${id}/risk-controls`, { auth: true, body }),
    revokeSession: (id: string) => request("POST", `/api/super-admin/users/${id}/revoke-session`, { auth: true }),
  },
  matches: {
    list: (query?: QueryParams) => request("GET", "/api/matches", { auth: true, query }),
    get: (id: string) => request("GET", `/api/matches/${id}`, { auth: true }),
    create: (body: Record<string, unknown>) => request("POST", "/api/super-admin/matches", { auth: true, body }),
    update: (id: string, body: Record<string, unknown>) => request("PUT", `/api/super-admin/matches/${id}`, { auth: true, body }),
    startLive: (id: string) => request("POST", `/api/super-admin/matches/${id}/start-live`, { auth: true }),
    close: (id: string) => request("POST", `/api/super-admin/matches/${id}/close`, { auth: true }),
    settle: (id: string, body: Record<string, unknown>) =>
      request("POST", `/api/super-admin/matches/${id}/settle`, { auth: true, body }),
    cancel: (id: string) => request("POST", `/api/super-admin/matches/${id}/cancel`, { auth: true }),
    emergencySuspend: (id: string, body?: Record<string, unknown>) =>
      request("POST", `/api/admin/matches/${id}/emergency_suspend`, { auth: true, body: body ?? {} }),
    emergencyResume: (id: string, body?: Record<string, unknown>) =>
      request("POST", `/api/admin/matches/${id}/emergency_resume`, { auth: true, body: body ?? {} }),
    suspendMarket: (id: string, marketKey: string, body?: Record<string, unknown>) =>
      request("POST", `/api/admin/matches/${id}/markets/${encodeURIComponent(marketKey)}/suspend`, {
        auth: true,
        body: body ?? {},
      }),
    resumeMarket: (id: string, marketKey: string, body?: Record<string, unknown>) =>
      request("POST", `/api/admin/matches/${id}/markets/${encodeURIComponent(marketKey)}/resume`, {
        auth: true,
        body: body ?? {},
      }),
    forceReprice: (id: string) => request("POST", `/api/admin/matches/${id}/force_reprice`, { auth: true }),
    emergencySuspendAllCricket: (body?: Record<string, unknown>) =>
      request("POST", "/api/admin/cricket/emergency_suspend_all", { auth: true, body: body ?? {} }),
    manualOverridePublish: (id: string, body: Record<string, unknown>) =>
      request("POST", `/api/admin/matches/${id}/manual_override_publish`, { auth: true, body }),
  },
  odds: {
    create: (matchId: string, body: Record<string, unknown>) =>
      request("POST", `/api/super-admin/matches/${matchId}/odds`, { auth: true, body }),
    list: (matchId: string, query?: QueryParams) =>
      request("GET", `/api/super-admin/matches/${matchId}/odds`, { auth: true, query }),
    providerReference: (matchId: string) =>
      request("GET", `/api/super-admin/matches/${matchId}/provider-odds`, { auth: true }),
    importProviderOdds: (matchId: string, body?: Record<string, unknown>) =>
      request("POST", `/api/super-admin/matches/${matchId}/provider-odds/import`, { auth: true, body: body ?? {} }),
    generate: (matchId: string, body?: Record<string, unknown>) =>
      request("POST", `/api/super-admin/matches/${matchId}/odds/generate`, { auth: true, body: body ?? {} }),
    publish: (matchId: string, body?: Record<string, unknown>) =>
      request("POST", `/api/super-admin/matches/${matchId}/odds/publish`, { auth: true, body: body ?? {} }),
    unpublish: (matchId: string, body?: Record<string, unknown>) =>
      request("POST", `/api/super-admin/matches/${matchId}/odds/unpublish`, { auth: true, body: body ?? {} }),
    regenerate: (matchId: string, body?: Record<string, unknown>) =>
      request("POST", `/api/super-admin/matches/${matchId}/odds/regenerate`, { auth: true, body: body ?? {} }),
    rewrite: (matchId: string, body: Record<string, unknown>) =>
      request("POST", `/api/super-admin/matches/${matchId}/odds/rewrite`, { auth: true, body }),
    orchestrate: (matchId: string, body?: Record<string, unknown>) =>
      request("POST", `/api/super-admin/matches/${matchId}/odds/orchestrate`, { auth: true, body: body ?? {} }),
    simulate: (matchId: string, body: Record<string, unknown>) =>
      request("POST", `/api/super-admin/matches/${matchId}/odds/simulate`, { auth: true, body }),
    update: (oddsId: string, body: Record<string, unknown>) => request("PUT", `/api/super-admin/odds/${oddsId}`, { auth: true, body }),
    activate: (oddsId: string) => request("POST", `/api/super-admin/odds/${oddsId}/activate`, { auth: true }),
    deactivate: (oddsId: string) => request("POST", `/api/super-admin/odds/${oddsId}/deactivate`, { auth: true }),
  },
  sportMarketConfigs: {
    list: (query?: QueryParams) => request("GET", "/api/super-admin/sport-market-configs", { auth: true, query }),
    upsert: (body: Record<string, unknown>) =>
      request("POST", "/api/super-admin/sport-market-configs", { auth: true, body }),
  },
  bets: {
    adminIndex: (query?: QueryParams) => request("GET", "/api/super-admin/bets", { auth: true, query }),
  },
  payments: {
    methods: () => request("GET", "/api/super-admin/payments/methods", { auth: true }),
    method: (id: string) => request("GET", `/api/super-admin/payments/methods/${id}`, { auth: true }),
    configure: (body: Record<string, unknown>) => request("POST", "/api/super-admin/payments/methods/configure", { auth: true, body }),
    uploadMethodLogo: (body: FormData) => request("POST", "/api/super-admin/payments/methods/logo/upload", { auth: true, body }),
    updateMethod: (id: string, body: Record<string, unknown>) => request("PUT", `/api/super-admin/payments/methods/${id}`, { auth: true, body }),
    activateMethod: (id: string) => request("POST", `/api/super-admin/payments/methods/${id}/activate`, { auth: true }),
    deactivateMethod: (id: string) => request("POST", `/api/super-admin/payments/methods/${id}/deactivate`, { auth: true }),
    approvals: () => request("GET", "/api/super-admin/payments/approvals", { auth: true }),
    approvalSummary: () => request("GET", "/api/super-admin/payments/approvals/summary", { auth: true }),
    approveDeposit: (id: string) => request("POST", `/api/super-admin/payments/deposits/${id}/approve`, { auth: true }),
    rejectDeposit: (id: string, body?: Record<string, unknown>) =>
      request("POST", `/api/super-admin/payments/deposits/${id}/reject`, { auth: true, body: body ?? {} }),
    approveWithdrawal: (id: string) => request("POST", `/api/super-admin/payments/withdrawals/${id}/approve`, { auth: true }),
    rejectWithdrawal: (id: string, body?: Record<string, unknown>) =>
      request("POST", `/api/super-admin/payments/withdrawals/${id}/reject`, { auth: true, body: body ?? {} }),
    transactions: () => request("GET", "/api/super-admin/payments/transactions", { auth: true }),
  },
  reports: {
    stats: () => request("GET", "/api/super-admin/reports/stats", { auth: true }),
    daily: (query?: QueryParams) => request("GET", "/api/super-admin/reports/daily", { auth: true, query }),
    weekly: (query?: QueryParams) => request("GET", "/api/super-admin/reports/weekly", { auth: true, query }),
    monthly: (query?: QueryParams) => request("GET", "/api/super-admin/reports/monthly", { auth: true, query }),
    masterAdmins: (query?: QueryParams) => request("GET", "/api/super-admin/reports/master-admins", { auth: true, query }),
    cricketQuoteCalibration: (query?: QueryParams) =>
      request("GET", "/api/super-admin/reports/cricket-quote-calibration", { auth: true, query }),
  },
  providers: {
    list: () => request("GET", "/api/super-admin/providers", { auth: true }),
    upsert: (body: Record<string, unknown>) => request("POST", "/api/super-admin/providers", { auth: true, body }),
    delete: (id: string) => request("DELETE", `/api/super-admin/providers/${id}`, { auth: true }),
    activate: (id: string) => request("POST", `/api/super-admin/providers/${id}/activate`, { auth: true }),
    enable: (id: string, body?: Record<string, unknown>) =>
      request("POST", `/api/super-admin/providers/${id}/enable`, { auth: true, body: body ?? {} }),
    health: () => request("GET", "/api/super-admin/providers/health", { auth: true }),
    syncNow: (body?: Record<string, unknown>) => request("POST", "/api/super-admin/providers/sync-now", { auth: true, body: body ?? {} }),
    syncLogs: (query?: QueryParams) => request("GET", "/api/super-admin/providers/sync-logs", { auth: true, query }),
    cricketDiscovery: (query?: QueryParams) =>
      request("GET", "/api/super-admin/cricket/discovery", { auth: true, query }),
    cricketAiObservability: (query?: QueryParams) =>
      request("GET", "/api/super-admin/cricket/ai-observability", { auth: true, query }),
    footballDiscovery: (query?: QueryParams) =>
      request("GET", "/api/super-admin/football/discovery", { auth: true, query }),
    resolveCricketSeason: (query?: QueryParams) =>
      request("GET", "/api/super-admin/cricket/resolve-season", { auth: true, query }),
    cricketAutomationRuns: (query?: QueryParams) =>
      request("GET", "/api/super-admin/cricket/automation-runs", { auth: true, query }),
    footballAutomationRuns: (query?: QueryParams) =>
      request("GET", "/api/super-admin/football/automation-runs", { auth: true, query }),
    competitionFeeds: (query?: QueryParams) =>
      request("GET", "/api/super-admin/competition-feeds", { auth: true, query }),
    competitionFeed: (id: string) =>
      request("GET", `/api/super-admin/competition-feeds/${id}`, { auth: true }),
    competitionFeedMetrics: (id: string) =>
      request("GET", `/api/super-admin/competition-feeds/${id}/metrics`, { auth: true }),
    createCompetitionFeed: (body: Record<string, unknown>) =>
      request("POST", "/api/super-admin/competition-feeds", { auth: true, body }),
    deleteCompetitionFeed: (id: string) =>
      request("DELETE", `/api/super-admin/competition-feeds/${id}`, { auth: true }),
    updateCompetitionFeed: (id: string, body: Record<string, unknown>) =>
      request("PUT", `/api/super-admin/competition-feeds/${id}`, { auth: true, body }),
    enableCompetitionFeed: (id: string, body?: Record<string, unknown>) =>
      request("POST", `/api/super-admin/competition-feeds/${id}/enable`, {
        auth: true,
        body: body ?? {},
      }),
    importCompetitionFeed: (id: string, body?: Record<string, unknown>) =>
      request("POST", `/api/super-admin/competition-feeds/${id}/import`, {
        auth: true,
        body: body ?? {},
      }),
    refreshCompetitionFeedUpcoming: (id: string, body?: Record<string, unknown>) =>
      request("POST", `/api/super-admin/competition-feeds/${id}/refresh-upcoming`, {
        auth: true,
        body: body ?? {},
      }),
    refreshCompetitionFeedLive: (id: string, body?: Record<string, unknown>) =>
      request("POST", `/api/super-admin/competition-feeds/${id}/refresh-live`, {
        auth: true,
        body: body ?? {},
      }),
  },
  multiSource: {
    suggestions: (query?: QueryParams) =>
      request("GET", "/api/super-admin/multi-source/match-suggestions", { auth: true, query }),
    health: () => request("GET", "/api/super-admin/multi-source/health", { auth: true }),
    automationStatus: () => request("GET", "/api/super-admin/multi-source/automation-status", { auth: true }),
    automationEvents: (query?: QueryParams) =>
      request("GET", "/api/super-admin/multi-source/automation-events", { auth: true, query }),
    pollingProfiles: () => request("GET", "/api/super-admin/multi-source/polling-profiles", { auth: true }),
    sourceRefreshAdvisory: (matchId: string) =>
      request("POST", `/api/super-admin/multi-source/polling-profiles/${encodeURIComponent(matchId)}/source-refresh-advisory`, { auth: true }),
    fetchSourceNow: (matchId: string) =>
      request("POST", `/api/super-admin/multi-source/polling-profiles/${encodeURIComponent(matchId)}/fetch-source-now`, { auth: true }),
    injectTestSuggestion: (body?: Record<string, unknown>) =>
      request("POST", "/api/super-admin/multi-source/inject-test-suggestion", { auth: true, body: body ?? {} }),
    gateways: () => request("GET", "/api/super-admin/multi-source/gateways", { auth: true }),
    createGateway: (body: Record<string, unknown>) =>
      request("POST", "/api/super-admin/multi-source/gateways", { auth: true, body }),
    updateGateway: (id: string, body: Record<string, unknown>) =>
      request("PUT", `/api/super-admin/multi-source/gateways/${id}`, { auth: true, body }),
    deleteGateway: (id: string) =>
      request("DELETE", `/api/super-admin/multi-source/gateways/${id}`, { auth: true }),
    scraperConfigurations: () => request("GET", "/api/super-admin/multi-source/scraper-configurations", { auth: true }),
    createScraperConfiguration: (body: Record<string, unknown>) =>
      request("POST", "/api/super-admin/multi-source/scraper-configurations", { auth: true, body }),
    updateScraperConfiguration: (id: string, body: Record<string, unknown>) =>
      request("PUT", `/api/super-admin/multi-source/scraper-configurations/${id}`, { auth: true, body }),
    deleteScraperConfiguration: (id: string) =>
      request("DELETE", `/api/super-admin/multi-source/scraper-configurations/${id}`, { auth: true }),
    replayScraperConfigurations: () =>
      request("POST", "/api/super-admin/multi-source/scraper-configurations/replay", { auth: true }),
    replayScraperConfiguration: (id: string) =>
      request("POST", `/api/super-admin/multi-source/scraper-configurations/${id}/replay`, { auth: true }),
    pruneInvalidSuggestions: () =>
      request("POST", "/api/super-admin/multi-source/match-suggestions/prune-invalid", { auth: true }),
    canonicalMatches: (query?: QueryParams) =>
      request("GET", "/api/super-admin/multi-source/canonical-matches", { auth: true, query }),
    approveSuggestion: (sourceName: string, sourceMatchId: string, body: Record<string, unknown>) =>
      request(
        "POST",
        `/api/super-admin/multi-source/match-suggestions/${encodeURIComponent(sourceName)}/${encodeURIComponent(sourceMatchId)}/approve`,
        { auth: true, body }
      ),
    rejectSuggestion: (sourceName: string, sourceMatchId: string, body: Record<string, unknown>) =>
      request(
        "POST",
        `/api/super-admin/multi-source/match-suggestions/${encodeURIComponent(sourceName)}/${encodeURIComponent(sourceMatchId)}/reject`,
        { auth: true, body }
      ),
    manualLinkSuggestion: (sourceName: string, sourceMatchId: string, body: Record<string, unknown>) =>
      request(
        "POST",
        `/api/super-admin/multi-source/match-suggestions/${encodeURIComponent(sourceName)}/${encodeURIComponent(sourceMatchId)}/manual-link`,
        { auth: true, body }
      ),
  },
  tennis: {
    fixtures: (query?: QueryParams) => request("GET", "/api/super-admin/tennis/fixtures", { auth: true, query }),
    liveDiscovery: () => request("GET", "/api/super-admin/tennis/live-discovery", { auth: true }),
    live: () => request("GET", "/api/super-admin/tennis/live", { auth: true }),
    desk: () => request("GET", "/api/super-admin/tennis/desk", { auth: true }),
    margin: () => request("GET", "/api/super-admin/tennis/margin", { auth: true }),
    updateMargin: (body: Record<string, unknown>) =>
      request("POST", "/api/super-admin/tennis/margin", { auth: true, body }),
    simulation: () => request("GET", "/api/super-admin/tennis/simulation", { auth: true }),
    updateSimulation: (body: Record<string, unknown>) =>
      request("POST", "/api/super-admin/tennis/simulation", { auth: true, body }),
    injectSimulation: (body: Record<string, unknown>) =>
      request("POST", "/api/super-admin/tennis/simulation/inject", { auth: true, body }),
    startTracking: (body: Record<string, unknown>) =>
      request("POST", "/api/super-admin/tennis/tracking/start", { auth: true, body }),
    stopTracking: (body: Record<string, unknown>) =>
      request("POST", "/api/super-admin/tennis/tracking/stop", { auth: true, body }),
    publish: (body: Record<string, unknown>) =>
      request("POST", "/api/super-admin/tennis/publish", { auth: true, body }),
    unpublish: (body: Record<string, unknown>) =>
      request("POST", "/api/super-admin/tennis/unpublish", { auth: true, body }),
  },
  sportsData: {
    events: (query?: QueryParams) => request("GET", "/api/super-admin/sports-data/events", { auth: true, query }),
    syncLogs: (query?: QueryParams) => request("GET", "/api/super-admin/sports-data/sync-logs", { auth: true, query }),
    rejections: (query?: QueryParams) => request("GET", "/api/super-admin/sports-data/rejections", { auth: true, query }),
    backfill: (body: Record<string, unknown>) => request("POST", "/api/super-admin/sports-data/backfill", { auth: true, body }),
    replayRejections: (body?: Record<string, unknown>) =>
      request("POST", "/api/super-admin/sports-data/replay-rejections", { auth: true, body: body ?? {} }),
  },
  settings: {
    openrouterSettings: () =>
      request("GET", "/api/super-admin/settings/openrouter", { auth: true }),
    openrouterModels: (query?: QueryParams) =>
      request("GET", "/api/super-admin/settings/openrouter/models", { auth: true, query }),
    setOpenrouterModel: (body: Record<string, unknown>) => request("POST", "/api/super-admin/settings/openrouter/model", { auth: true, body }),
    setOpenrouterKey: (body: Record<string, unknown>) => request("POST", "/api/super-admin/settings/openrouter/key", { auth: true, body }),
    accountCurrencies: () => request("GET", "/api/super-admin/settings/account-currencies", { auth: true }),
    updateAccountCurrencies: (body: Record<string, unknown>) =>
      request("PUT", "/api/super-admin/settings/account-currencies", { auth: true, body }),
    landingWhatsapp: () => request("GET", "/api/super-admin/settings/landing-whatsapp", { auth: true }),
    updateLandingWhatsapp: (body: Record<string, unknown>) =>
      request("PUT", "/api/super-admin/settings/landing-whatsapp", { auth: true, body }),
  },
  assistant: {
    documents: (query?: QueryParams) => request("GET", "/api/super-admin/assistant/docs", { auth: true, query }),
    uploadDocument: (body: FormData) => request("POST", "/api/super-admin/assistant/docs/upload", { auth: true, body }),
    approveDocument: (id: string) => request("POST", `/api/super-admin/assistant/docs/${id}/approve`, { auth: true }),
    archiveDocument: (id: string) => request("POST", `/api/super-admin/assistant/docs/${id}/archive`, { auth: true }),
    faqs: (query?: QueryParams) => request("GET", "/api/super-admin/assistant/faqs", { auth: true, query }),
    createFaq: (body: Record<string, unknown>) => request("POST", "/api/super-admin/assistant/faqs", { auth: true, body }),
    updateFaq: (id: string, body: Record<string, unknown>) =>
      request("PUT", `/api/super-admin/assistant/faqs/${id}`, { auth: true, body }),
    deleteFaq: (id: string) => request("DELETE", `/api/super-admin/assistant/faqs/${id}`, { auth: true }),
    approveFaq: (id: string) => request("POST", `/api/super-admin/assistant/faqs/${id}/approve`, { auth: true }),
    archiveFaq: (id: string) => request("POST", `/api/super-admin/assistant/faqs/${id}/archive`, { auth: true }),
    faqDrafts: (query?: QueryParams) => request("GET", "/api/super-admin/assistant/faq-drafts", { auth: true, query }),
    createFaqDraft: (body: Record<string, unknown>) =>
      request("POST", "/api/super-admin/assistant/faq-drafts", { auth: true, body }),
    updateFaqDraft: (id: string, body: Record<string, unknown>) =>
      request("PUT", `/api/super-admin/assistant/faq-drafts/${id}`, { auth: true, body }),
    deleteFaqDraft: (id: string) => request("DELETE", `/api/super-admin/assistant/faq-drafts/${id}`, { auth: true }),
    dismissFaqDraft: (id: string) =>
      request("POST", `/api/super-admin/assistant/faq-drafts/${id}/dismiss`, { auth: true }),
    analytics: () => request("GET", "/api/super-admin/assistant/analytics", { auth: true }),
  },
  resetSupport: {
    list: () => request("GET", "/api/super-admin/reset-support/contacts", { auth: true }),
    create: (body: Record<string, unknown>) =>
      request("POST", "/api/super-admin/reset-support/contacts", { auth: true, body }),
    update: (id: string, body: Record<string, unknown>) =>
      request("PUT", `/api/super-admin/reset-support/contacts/${id}`, { auth: true, body }),
    delete: (id: string) => request("DELETE", `/api/super-admin/reset-support/contacts/${id}`, { auth: true }),
  },
};
