defmodule Back.Providers.Entitysport do
  @behaviour Back.Providers.Behaviour
  alias Back.Providers.AdapterUtils

  @default_base_url "https://rest.entitysport.com/v2"

  @impl true
  def fetch_fixtures(config), do: fetch(config, Map.get(config, "fixtures_endpoint", "/matches"))

  @impl true
  def fetch_live(config),
    do: fetch(config, Map.get(config, "live_endpoint", "/matches"), %{"status" => 3})

  @impl true
  def fetch_fixtures_for_feed(config, feed) do
    fetch_for_feed(config, Map.get(config, "fixtures_endpoint", "/matches"), %{}, feed)
  end

  @impl true
  def fetch_live_for_feed(config, feed) do
    fetch_for_feed(config, Map.get(config, "live_endpoint", "/matches"), %{"status" => 3}, feed)
  end

  @impl true
  def fetch_odds_for_match(_config, _match), do: {:error, :provider_odds_not_supported}

  @impl true
  def normalize(raw) do
    %{
      external_id: to_string(raw["match_id"] || raw["id"]),
      provider: "entitysport",
      sport: AdapterUtils.infer_sport(raw, "cricket"),
      team1: raw["teama"] |> team_name() || raw["team1"] || "Team 1",
      team2: raw["teamb"] |> team_name() || raw["team2"] || "Team 2",
      start_time: AdapterUtils.first_non_nil([raw["date_start"], raw["start_time"], raw["date"]]),
      status: normalize_status(raw["status"] || raw["status_str"]),
      score: %{"score" => raw["score"] || %{}},
      raw: raw
    }
  end

  defp fetch(config, endpoint, extra_params \\ %{}) do
    fetch_for_feed(config, endpoint, extra_params, %{})
  end

  defp fetch_for_feed(config, endpoint, extra_params, feed) do
    base_url = Map.get(config, "base_url", @default_base_url)
    api_key = Map.get(config, "api_key")

    params =
      config
      |> Map.get("params", %{})
      |> Map.merge(extra_params)
      |> AdapterUtils.merge_params(AdapterUtils.feed_params(feed))
      |> maybe_put_api_key(api_key)

    case Req.get(base_url <> endpoint, params: params, headers: [{"Accept", "application/json"}]) do
      {:ok, %{status: 200, body: body}} -> {:ok, extract_list(body)}
      {:ok, %{status: status, body: body}} -> {:error, {:http_error, status, body}}
      {:error, reason} -> {:error, reason}
    end
  end

  defp maybe_put_api_key(params, nil), do: params
  defp maybe_put_api_key(params, key), do: Map.put_new(params, "token", key)

  defp extract_list(%{"response" => %{"items" => list}}) when is_list(list), do: list
  defp extract_list(%{"response" => %{"matches" => list}}) when is_list(list), do: list
  defp extract_list(%{"response" => list}) when is_list(list), do: list
  defp extract_list(list) when is_list(list), do: list
  defp extract_list(_), do: []

  defp team_name(%{"name" => name}), do: name
  defp team_name(_), do: nil

  defp normalize_status(status), do: AdapterUtils.normalize_status(status)
end
