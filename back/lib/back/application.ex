defmodule Back.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children =
      [
        BackWeb.Telemetry,
        Back.Repo,
        {Oban, Application.fetch_env!(:back, Oban)},
        {DNSCluster, query: Application.get_env(:back, :dns_cluster_query) || :ignore},
        {Phoenix.PubSub, name: Back.PubSub},
        {Registry, keys: :unique, name: Back.Live.CricketMatchWorkerRegistry},
        {DynamicSupervisor, strategy: :one_for_one, name: Back.Live.CricketMatchWorkerSupervisor},
        {Task.Supervisor, name: Back.TaskSupervisor},
        Back.Auth.TokenBlacklist,
        Back.Live.CricketSportmonksConsumer,
        Back.Live.HeartbeatMonitor,
        BackWeb.Endpoint
      ] ++
        maybe_sportmonks_live_index() ++
        maybe_api_sports_live_odds_index() ++
        maybe_sportmonks_detail_refresher() ++
        maybe_match_fetcher() ++
        maybe_api_tennis_ws() ++ maybe_tennis_supervisor() ++ maybe_multi_source_supervisor()

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: Back.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    BackWeb.Endpoint.config_change(changed, removed)
    :ok
  end

  defp maybe_match_fetcher do
    if Application.get_env(:back, :start_match_fetcher_in_tests, false) or Mix.env() != :test do
      [Back.Workers.MatchFetcher]
    else
      []
    end
  end

  defp maybe_sportmonks_live_index do
    if Application.get_env(:back, :start_sportmonks_live_index_in_tests, false) or
         Mix.env() != :test do
      [Back.Providers.SportmonksLiveIndex]
    else
      []
    end
  end

  defp maybe_sportmonks_detail_refresher do
    if Application.get_env(:back, :start_sportmonks_detail_refresher_in_tests, false) or
         Mix.env() != :test do
      [Back.Providers.SportmonksDetailRefresher]
    else
      []
    end
  end

  defp maybe_api_sports_live_odds_index do
    if Application.get_env(:back, :start_api_sports_live_odds_index_in_tests, false) or
         Mix.env() != :test do
      [Back.Providers.ApiSportsLiveOddsIndex]
    else
      []
    end
  end

  defp maybe_api_tennis_ws do
    if Application.get_env(:back, :api_tennis_ws_enabled, false) do
      [Back.SportsProviders.ApiTennisSocketSupervisor]
    else
      []
    end
  end

  defp maybe_tennis_supervisor do
    if Application.get_env(:back, :tennis_live_sync_enabled, true) do
      [Back.Tennis.Supervisor]
    else
      []
    end
  end

  defp maybe_multi_source_supervisor do
    if Application.get_env(:back, :multi_source_arbiter_enabled, false) do
      [Back.MultiSource.Supervisor]
    else
      []
    end
  end
end
