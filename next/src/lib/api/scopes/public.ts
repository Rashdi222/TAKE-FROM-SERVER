import { request } from "../http";
import type { ListResponse, DataResponse } from "../response";
import type {
  AuthTokenResponse,
  LoginRequest,
  RefreshRequest,
  RefreshResponse,
  RegisterRequest,
  ResetPasswordRequest,
  ResetPasswordValidateResponse,
} from "../types/auth";
import type { AccountCurrenciesResponse } from "../types/settings";
import type { LandingWhatsappSettingsResponse } from "../types/settings";
import type { Match, MatchCompetitionAggregate } from "../types/matches";
import type { Odds } from "../types/odds";
import type { PublicTournament } from "../types/providers";
import type { ForgotPasswordSupportLookupResponse } from "../types/resetSupport";
import type { TennisFixture, TennisMatchState } from "../types/tennis";
import type { QueryParams } from "../http";

export const publicApi = {
  auth: {
    register: (body: RegisterRequest) => request<AuthTokenResponse>("POST", "/api/auth/register", { body }),
    login: (body: LoginRequest) => request<AuthTokenResponse>("POST", "/api/auth/login", { body }),
    refresh: (body: RefreshRequest) => request<RefreshResponse>("POST", "/api/auth/refresh", { body }),
    forgotPasswordSupport: (body: { phone_number?: string; email?: string }) =>
      request<DataResponse<ForgotPasswordSupportLookupResponse>>(
        "POST",
        "/api/auth/forgot-password-support",
        { body }
      ),
    validateResetPassword: (token: string) =>
      request<DataResponse<ResetPasswordValidateResponse>>("GET", "/api/auth/reset-password/validate", {
        query: { token },
      }),
    resetPassword: (body: ResetPasswordRequest) =>
      request<DataResponse<{ password_reset: boolean }>>("POST", "/api/auth/reset-password", { body }),
  },
  settings: {
    accountCurrencies: () =>
      request<AccountCurrenciesResponse>("GET", "/api/settings/account-currencies", {}),
    landingWhatsapp: () =>
      request<LandingWhatsappSettingsResponse>("GET", "/api/settings/landing-whatsapp", {}),
  },
  matches: {
    list: (query?: QueryParams) => request<ListResponse<Match>>("GET", "/api/matches", { query }),
    competitionAggregates: (query?: QueryParams) =>
      request<ListResponse<MatchCompetitionAggregate>>("GET", "/api/matches/competition-aggregates", { query }),
    get: (id: string) => request<DataResponse<Match>>("GET", `/api/matches/${id}`, {}),
    odds: (matchId: string) => request<ListResponse<Odds>>("GET", `/api/matches/${matchId}/odds`, {}),
  },
  tournaments: {
    list: () => request<ListResponse<PublicTournament>>("GET", "/api/tournaments", {}),
    get: (id: string) => request<DataResponse<PublicTournament>>("GET", `/api/tournaments/${id}`, {}),
  },
  tennis: {
    fixtures: (query?: QueryParams) => request<ListResponse<TennisFixture>>("GET", "/api/tennis/fixtures", { query }),
    live: () => request<ListResponse<TennisMatchState>>("GET", "/api/tennis/live", {}),
    match: (eventKey: string, query?: QueryParams) =>
      request<DataResponse<TennisMatchState | TennisFixture | null>>(
        "GET",
        `/api/tennis/matches/${encodeURIComponent(eventKey)}`,
        { query },
      ),
  },
};
