defmodule Back.Providers.Cricketdata do
  @behaviour Back.Providers.Behaviour
  alias Back.Providers.AdapterUtils

  @default_base_url "https://api.cricketdata.org"

  @impl true
  def fetch_fixtures(config),
    do: fetch(config, Map.get(config, "fixtures_endpoint", "/v1/matches"))

  @impl true
  def fetch_live(config),
    do: fetch(config, Map.get(config, "live_endpoint", "/v1/currentMatches"))

  @impl true
  def fetch_fixtures_for_feed(config, feed),
    do: fetch_for_feed(config, Map.get(config, "fixtures_endpoint", "/v1/matches"), feed)

  @impl true
  def fetch_live_for_feed(config, feed),
    do: fetch_for_feed(config, Map.get(config, "live_endpoint", "/v1/currentMatches"), feed)

  @impl true
  def fetch_odds_for_match(_config, _match), do: {:error, :provider_odds_not_supported}

  @impl true
  def normalize(raw) do
    teams = raw["teams"] || []
    team_info = raw["teamInfo"]
    team1 = Enum.at(teams, 0) || extract_team_name(team_info, 0) || "Team 1"
    team2 = Enum.at(teams, 1) || extract_team_name(team_info, 1) || "Team 2"

    %{
      external_id: to_string(raw["id"] || raw["match_id"]),
      provider: "cricketdata",
      sport: AdapterUtils.infer_sport(raw, "cricket"),
      team1: team1,
      team2: team2,
      start_time:
        AdapterUtils.first_non_nil([raw["dateTimeGMT"], raw["date"], raw["start_time"]]),
      status: normalize_status(raw["matchStarted"], raw["matchEnded"], raw["status"]),
      score: %{"score" => raw["score"] || %{}},
      raw: raw
    }
  end

  defp fetch(config, endpoint) do
    fetch_for_feed(config, endpoint, %{})
  end

  defp fetch_for_feed(config, endpoint, feed) do
    base_url = Map.get(config, "base_url", @default_base_url)
    api_key = Map.get(config, "api_key")

    params =
      config
      |> Map.get("params", %{})
      |> AdapterUtils.merge_params(AdapterUtils.feed_params(feed))
      |> maybe_put_api_key(api_key)

    case Req.get(base_url <> endpoint, params: params, headers: [{"Accept", "application/json"}]) do
      {:ok, %{status: 200, body: body}} -> {:ok, AdapterUtils.as_list(body)}
      {:ok, %{status: status, body: body}} -> {:error, {:http_error, status, body}}
      {:error, reason} -> {:error, reason}
    end
  end

  defp maybe_put_api_key(params, nil), do: params
  defp maybe_put_api_key(params, key), do: Map.put_new(params, "apikey", key)

  defp extract_team_name(nil, _), do: nil

  defp extract_team_name(team_info, idx) when is_list(team_info) do
    case Enum.at(team_info, idx) do
      %{"name" => name} -> name
      _ -> nil
    end
  end

  defp extract_team_name(_, _), do: nil

  defp normalize_status(true, false, _), do: "live"
  defp normalize_status(_, true, _), do: "completed"
  defp normalize_status(_, _, status), do: AdapterUtils.normalize_status(status)
end
