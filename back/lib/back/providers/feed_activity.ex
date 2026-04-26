defmodule Back.Providers.FeedActivity do
  alias Back.Providers
  alias Back.Betting.Match
  alias Back.Providers.Provider

  def log_provider_odds_fetch(%Provider{} = provider, %Match{} = match, result, duration_ms) do
    log_provider_odds_activity(provider, match, "provider_odds_fetch", result, duration_ms)
  end

  def log_provider_odds_import(%Provider{} = provider, %Match{} = match, result, duration_ms) do
    log_provider_odds_activity(provider, match, "provider_odds_import", result, duration_ms)
  end

  defp log_provider_odds_activity(
         %Provider{} = provider,
         %Match{} = match,
         kind,
         result,
         duration_ms
       ) do
    {status, error, extra_metadata} =
      case result do
        metadata when is_map(metadata) -> {:success, nil, metadata}
        {:ok, metadata} -> {:success, nil, metadata}
        {:error, reason} -> {:failure, inspect(reason), %{}}
      end

    feed_meta = competition_feed_metadata(match)

    Providers.log_sync_result(%{
      provider_id: provider.id,
      sync_type: "manual",
      status: status,
      error: error,
      duration_ms: duration_ms,
      metadata:
        feed_meta
        |> Map.put("kind", kind)
        |> Map.put("match_id", match.id)
        |> Map.put("external_id", match.external_id)
        |> Map.merge(extra_metadata)
    })
  end

  defp competition_feed_metadata(%Match{} = match) do
    competition_feed = get_in(match.raw_data || %{}, ["_competition_feed"]) || %{}

    %{
      "competition_feed_id" => competition_feed["id"],
      "competition_key" => competition_feed["competition_key"],
      "season_id" => competition_feed["season_id"],
      "league_id" => competition_feed["league_id"]
    }
    |> Enum.reject(fn {_k, v} -> is_nil(v) end)
    |> Map.new()
  end
end
