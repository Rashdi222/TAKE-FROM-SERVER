import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { superAdminApi } from "@/lib/api";
import type { TennisDeskResponse, TennisMatchState } from "@/lib/api";

type TennisFixtureFilters = {
  date_start?: string;
  date_stop?: string;
};

export function useTennisFixtures(filters?: TennisFixtureFilters) {
  return useQuery({
    queryKey: ["super-admin", "tennis", "fixtures", filters ?? {}],
    queryFn: () => superAdminApi.tennis.fixtures(filters),
    staleTime: 60_000,
  });
}

export function useTennisLiveMatches() {
  return useQuery({
    queryKey: ["super-admin", "tennis", "live"],
    queryFn: () => superAdminApi.tennis.live(),
    refetchInterval: 5_000,
  });
}

export function useTennisLiveDiscovery() {
  return useQuery({
    queryKey: ["super-admin", "tennis", "live-discovery"],
    queryFn: () => superAdminApi.tennis.liveDiscovery(),
    refetchInterval: 10_000,
  });
}

export function useTennisDeskMatches() {
  return useQuery({
    queryKey: ["super-admin", "tennis", "desk"],
    queryFn: () => superAdminApi.tennis.desk(),
    refetchInterval: 5_000,
  });
}

export function useTennisMargin() {
  return useQuery({
    queryKey: ["super-admin", "tennis", "margin"],
    queryFn: () => superAdminApi.tennis.margin(),
    staleTime: 5_000,
  });
}

export function useStartTennisTracking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.tennis.startTracking(body),
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["super-admin", "tennis", "live"] }),
        queryClient.cancelQueries({ queryKey: ["super-admin", "tennis", "desk"] }),
      ]);
    },
    onSuccess: (_result, variables) => {
      const eventKey = String(variables.event_key ?? "");
      const placeholder: TennisMatchState = {
        event_key: eventKey,
        player_1_name: String(variables.player_1_name ?? ""),
        player_2_name: String(variables.player_2_name ?? ""),
        published: false,
        publish_status: "unpublished",
        tracking_status: "waiting_live_state",
        workflow_label: "Waiting for live score",
        workflow_hint: "Tracked successfully. Awaiting the first live payload from API Tennis.",
        fixture_snapshot: {
          tournament_name: variables.tournament_name,
          player_1_name: variables.player_1_name,
          player_2_name: variables.player_2_name,
          start_time: variables.start_time,
        },
      };

      queryClient.setQueryData(["super-admin", "tennis", "live"], (current: { data?: TennisMatchState[] } | undefined) => {
        const rows = current?.data ?? [];
        if (rows.some((row) => row.event_key === eventKey)) return current;
        return { data: [placeholder, ...rows] };
      });

      queryClient.setQueryData(["super-admin", "tennis", "desk"], (current: { data?: TennisDeskResponse } | undefined) => {
        const desk = current?.data;
        if (!desk) return current;
        if ((desk.matches ?? []).some((row) => row.event_key === eventKey)) return current;
        return {
          data: {
            ...desk,
            matches: [placeholder, ...(desk.matches ?? [])],
          },
        };
      });

      queryClient.invalidateQueries({ queryKey: ["super-admin", "tennis", "fixtures"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tennis", "live-discovery"] });
    },
  });
}

export function useStopTennisTracking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.tennis.stopTracking(body),
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["super-admin", "tennis", "live"] }),
        queryClient.cancelQueries({ queryKey: ["super-admin", "tennis", "desk"] }),
      ]);
    },
    onSuccess: (_result, variables) => {
      const eventKey = String(variables.event_key ?? "");

      queryClient.setQueryData(["super-admin", "tennis", "live"], (current: { data?: TennisMatchState[] } | undefined) => ({
        data: (current?.data ?? []).filter((row) => row.event_key !== eventKey),
      }));

      queryClient.setQueryData(["super-admin", "tennis", "desk"], (current: { data?: TennisDeskResponse } | undefined) => {
        const desk = current?.data;
        if (!desk) return current;
        return {
          data: {
            ...desk,
            matches: (desk.matches ?? []).filter((row) => row.event_key !== eventKey),
          },
        };
      });

      queryClient.invalidateQueries({ queryKey: ["super-admin", "tennis", "fixtures"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tennis", "live-discovery"] });
    },
  });
}

export function usePublishTennisMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.tennis.publish(body),
    onSuccess: (_result, variables) => {
      const eventKey = String(variables.event_key ?? "");
      const applyPublished = (row: TennisMatchState) =>
        row.event_key === eventKey
          ? {
              ...row,
              published: true,
              publish_status: "published",
              tracking_status: "published",
              workflow_label: "Published",
              workflow_hint: "This match is visible on the public tennis side with published odds.",
            }
          : row;

      queryClient.setQueryData(["super-admin", "tennis", "live"], (current: { data?: TennisMatchState[] } | undefined) => ({
        data: (current?.data ?? []).map(applyPublished),
      }));

      queryClient.setQueryData(["super-admin", "tennis", "desk"], (current: { data?: TennisDeskResponse } | undefined) => {
        const desk = current?.data;
        if (!desk) return current;
        return {
          data: {
            ...desk,
            matches: (desk.matches ?? []).map(applyPublished),
          },
        };
      });

      queryClient.invalidateQueries({ queryKey: ["super-admin", "tennis", "live"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tennis", "desk"] });
    },
  });
}

export function useUnpublishTennisMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.tennis.unpublish(body),
    onSuccess: (_result, variables) => {
      const eventKey = String(variables.event_key ?? "");
      const applyUnpublished = (row: TennisMatchState) =>
        row.event_key === eventKey
          ? {
              ...row,
              published: false,
              publish_status: "unpublished",
              tracking_status: Array.isArray(row.published_odds) && row.published_odds.length > 0 ? "ready_to_publish" : "waiting_provider_odds",
              workflow_label: Array.isArray(row.published_odds) && row.published_odds.length > 0 ? "Ready to publish" : "Waiting for provider odds",
              workflow_hint:
                Array.isArray(row.published_odds) && row.published_odds.length > 0
                  ? "Live score and odds are present. Publish the match when you want it visible publicly."
                  : "Live score is present but API Tennis has not supplied usable live odds yet.",
            }
          : row;

      queryClient.setQueryData(["super-admin", "tennis", "live"], (current: { data?: TennisMatchState[] } | undefined) => ({
        data: (current?.data ?? []).map(applyUnpublished),
      }));

      queryClient.setQueryData(["super-admin", "tennis", "desk"], (current: { data?: TennisDeskResponse } | undefined) => {
        const desk = current?.data;
        if (!desk) return current;
        return {
          data: {
            ...desk,
            matches: (desk.matches ?? []).map(applyUnpublished),
          },
        };
      });

      queryClient.invalidateQueries({ queryKey: ["super-admin", "tennis", "live"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tennis", "desk"] });
    },
  });
}

export function useUpdateTennisMargin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.tennis.updateMargin(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tennis", "margin"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tennis", "desk"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tennis", "live"] });
    },
  });
}

export function useUpdateTennisSimulation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.tennis.updateSimulation(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tennis", "desk"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tennis", "live"] });
    },
  });
}

export function useInjectTennisSimulation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => superAdminApi.tennis.injectSimulation(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tennis", "desk"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tennis", "live"] });
    },
  });
}
