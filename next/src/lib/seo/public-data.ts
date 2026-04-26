import type { ListResponse, DataResponse } from "@/lib/api/response";
import type { Match, Odds } from "@/lib/api";
import type { PublicTournament } from "@/lib/api/types/providers";
import { getApiBaseUrl } from "@/lib/seo/site";

async function fetchJson<T>(path: string, revalidate = 300): Promise<T | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      next: { revalidate },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchPublicMatch(id: string) {
  const payload = await fetchJson<DataResponse<Match>>(`/api/matches/${id}`, 300);
  return payload?.data ?? null;
}

export async function fetchPublicMatchOdds(id: string) {
  const payload = await fetchJson<ListResponse<Odds>>(`/api/matches/${id}/odds`, 120);
  return payload?.data ?? [];
}

export async function fetchPublicTournaments() {
  const payload = await fetchJson<ListResponse<PublicTournament>>("/api/tournaments", 900);
  return payload?.data ?? [];
}

export async function fetchPublicTournament(id: string) {
  const payload = await fetchJson<DataResponse<PublicTournament>>(`/api/tournaments/${id}`, 300);
  return payload?.data ?? null;
}
