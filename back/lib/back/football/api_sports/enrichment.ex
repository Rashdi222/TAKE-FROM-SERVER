defmodule Back.Football.ApiSports.Enrichment do
  @moduledoc false

  require Logger

  alias Back.Betting.Match
  alias Back.Football.ApiSports.ContextCache
  alias Back.Football.ApiSports.Normalizers
  alias Back.Providers
  alias Back.Providers.ApiSports
  alias Back.Providers.CompetitionFeed
  alias Back.Repo
  alias BackWeb.MatchChannel

  @event_ttl_ms 15_000
  @lineup_ttl_ms :timer.minutes(15)
  @statistics_ttl_ms 15_000
  @standings_ttl_ms :timer.hours(1)

  def enrich_async(%Match{} = match) do
    if match.sport == :football and match.provider == "api_sports" do
      Task.Supervisor.start_child(Back.TaskSupervisor, fn ->
        _ = enrich_and_persist(match)
      end)

      :ok
    else
      :ignored
    end
  end

  def enrich_and_persist(%Match{} = match) do
    with {:ok, provider} <- Providers.get_provider_by_name("api_sports"),
         {:ok, context} <-
           fetch_context(match, Providers.provider_adapter_config(provider), load_feed(match)) do
      persist_context(match, context)
    end
  end

  def fetch_context(%Match{} = match, provider_config, feed \\ nil)
      when is_map(provider_config) do
    fixture_id =
      match.external_id ||
        get_in(match.raw_data || %{}, ["fixture", "id"]) ||
        get_in(match.raw_data || %{}, ["fixture_id"])

    if is_binary(fixture_id) and String.trim(fixture_id) != "" do
      coverage = coverage_flags(feed)

      events_lane =
        fetch_cached({:events, fixture_id}, @event_ttl_ms, fn ->
          ApiSports.fetch_fixture_events(provider_config, fixture_id)
        end)

      lineups_lane =
        if coverage.lineups do
          fetch_cached({:lineups, fixture_id}, @lineup_ttl_ms, fn ->
            ApiSports.fetch_fixture_lineups(provider_config, fixture_id)
          end)
        else
          unsupported_lane("lineups", "Detailed lineups are not covered for this competition.")
        end

      statistics_lane =
        if coverage.statistics do
          fetch_cached({:statistics, fixture_id}, @statistics_ttl_ms, fn ->
            ApiSports.fetch_fixture_statistics(provider_config, fixture_id)
          end)
        else
          unsupported_lane(
            "statistics",
            "Detailed live statistics are not covered for this competition."
          )
        end

      standings_lane =
        if coverage.standings and is_binary(coverage.league_id) and is_binary(coverage.season_id) do
          fetch_cached(
            {:standings, coverage.league_id, coverage.season_id},
            @standings_ttl_ms,
            fn ->
              ApiSports.fetch_standings(provider_config, coverage.league_id, coverage.season_id)
            end
          )
        else
          unsupported_lane("standings", "Standings impact is not covered for this competition.")
        end

      payload = %{
        events: events_lane.data,
        lineups: lineups_lane.data,
        statistics: statistics_lane.data,
        standings: standings_lane.data,
        meta: %{
          events: events_lane.meta,
          lineups: lineups_lane.meta,
          statistics: statistics_lane.meta,
          standings: standings_lane.meta
        }
      }

      {:ok, Normalizers.normalize(payload, match)}
    else
      {:error, :missing_fixture_id}
    end
  end

  defp persist_context(%Match{} = match, context) when is_map(context) do
    raw_data =
      match.raw_data
      |> normalize_map()
      |> Map.put("football_context", context)

    match =
      match
      |> Match.live_state_changeset(%{raw_data: raw_data})
      |> Repo.update!()

    MatchChannel.broadcast_match_state_updated(match, %{"kind" => "football_context_refresh"})
    {:ok, match}
  end

  defp load_feed(%Match{competition_feed_id: nil}), do: nil
  defp load_feed(%Match{competition_feed_id: id}), do: Repo.get(CompetitionFeed, id)

  defp fetch_cached(key, ttl_ms, fetcher) do
    case ContextCache.get(key, ttl_ms) do
      {:ok, value} ->
        %{
          data: value,
          meta: lane_meta("ok", nil)
        }

      :miss ->
        case fetcher.() do
          {:ok, rows} ->
            _ = ContextCache.put(key, rows)

            %{
              data: rows,
              meta: lane_meta("ok", nil)
            }

          {:error, reason} ->
            Logger.warning(
              "football enrichment fetch failed: #{inspect(key)} reason=#{inspect(reason)}"
            )

            %{
              data: [],
              meta: lane_meta(error_status(reason), lane_message(reason))
            }
        end
    end
  end

  defp coverage_flags(nil) do
    %{lineups: false, statistics: false, standings: false, league_id: nil, season_id: nil}
  end

  defp coverage_flags(%CompetitionFeed{} = feed) do
    raw =
      (feed.config || %{})
      |> Map.get("discovery_context", %{})

    season =
      raw
      |> Map.get("seasons", [])
      |> List.wrap()
      |> Enum.find(fn item ->
        to_string(item["year"] || "") == to_string(feed.season_id || "")
      end)

    coverage = (season && season["coverage"]) || %{}
    fixtures_coverage = coverage["fixtures"] || %{}

    %{
      lineups: truthy?(fixtures_coverage["lineups"]),
      statistics: truthy?(fixtures_coverage["statistics_fixtures"]),
      standings: truthy?(coverage["standings"]),
      league_id: present_string(feed.league_id),
      season_id: present_string(feed.season_id)
    }
  end

  defp unsupported_lane(lane, message) do
    %{
      data: [],
      meta: lane_meta("unsupported", message, lane)
    }
  end

  defp lane_meta(status, message, lane \\ nil) do
    base = %{
      status: status,
      message: message,
      updated_at: DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
    }

    if is_binary(lane), do: Map.put(base, :lane, lane), else: base
  end

  defp error_status({:http_error, 429, _body}), do: "rate_limited"
  defp error_status({:http_error, 403, _body}), do: "auth_failed"
  defp error_status(_), do: "unavailable"

  defp lane_message({:http_error, 429, _body}),
    do: "Provider rate limit hit. Automatic retry is in progress."

  defp lane_message({:http_error, 403, _body}),
    do: "Provider access for this enrichment lane is currently unavailable."

  defp lane_message({:provider_error, errors}),
    do: "Provider rejected the enrichment request: #{inspect(errors)}"

  defp lane_message(_), do: "Provider did not return detailed enrichment data for this lane."

  defp truthy?(value) when value in [true, "true"], do: true
  defp truthy?(value) when is_map(value), do: map_size(value) > 0
  defp truthy?(_), do: false

  defp normalize_map(%{} = value), do: value
  defp normalize_map(_), do: %{}

  defp present_string(value) when is_binary(value) do
    case String.trim(value) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  defp present_string(value) when is_integer(value), do: Integer.to_string(value)
  defp present_string(_), do: nil
end
