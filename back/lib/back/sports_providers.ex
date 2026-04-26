defmodule Back.SportsProviders do
  @moduledoc false

  alias Back.SportsData
  alias Back.SportsProviders.{ApiTennis, BetsApi, Goalserve}

  def sync_tennis(opts \\ []) do
    with {:ok, events} <- ApiTennis.fetch_fixtures(opts) do
      SportsData.upsert_events(events)
    end
  end

  def sync_horse_racing(opts \\ []) do
    with {:ok, events} <- Goalserve.fetch_fixtures(opts) do
      SportsData.upsert_events(events)
    end
  end

  def sync_greyhound(opts \\ []) do
    with {:ok, live_events} <- BetsApi.fetch_live(opts),
         {:ok, upcoming_events} <- BetsApi.fetch_fixtures(opts) do
      SportsData.upsert_events(live_events ++ upcoming_events)
    end
  end
end
