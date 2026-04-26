defmodule Back.Providers.SportmonksLiveIndexTest do
  use Back.DataCase, async: false

  alias Back.Providers.CompetitionFeed
  alias Back.Providers.Provider
  alias Back.Providers.SportmonksLiveIndex
  alias Back.Repo

  test "refresh_once indexes deduped live fixtures and summarizes by feed scope" do
    now_ms = System.system_time(:millisecond)

    provider =
      Repo.insert!(%Provider{
        name: "sportmonks",
        is_enabled: true,
        is_active: true,
        config: %{}
      })

    feed =
      Repo.insert!(%CompetitionFeed{
        provider_id: provider.id,
        name: "PSL",
        sport: "cricket",
        competition_key: "psl-2026",
        enabled: true,
        league_id: "10",
        season_id: "99",
        config: %{}
      })

    rows = [
      %{
        "id" => 101,
        "status" => "Live",
        "league_id" => 10,
        "season_id" => 99,
        "starting_at" => "2026-04-13T10:00:00Z",
        "localteam" => %{"name" => "A"},
        "visitorteam" => %{"name" => "B"},
        "runs" => [%{"score" => 120, "wickets" => 4}],
        "balls" => [%{"id" => 1, "ball" => 2, "over" => "14.2", "result" => "1"}]
      },
      %{
        "id" => 101,
        "status" => "Live",
        "league_id" => 10,
        "season_id" => 99,
        "starting_at" => "2026-04-13T10:00:00Z",
        "localteam" => %{"name" => "A"},
        "visitorteam" => %{"name" => "B"},
        "runs" => [%{"score" => 121, "wickets" => 4}],
        "balls" => [%{"id" => 2, "ball" => 3, "over" => "14.3", "result" => "4"}]
      },
      %{
        "id" => 202,
        "status" => "Finished",
        "league_id" => 11,
        "season_id" => 88,
        "starting_at" => "2026-04-13T12:00:00Z",
        "localteam" => %{"name" => "C"},
        "visitorteam" => %{"name" => "D"}
      }
    ]

    assert {:ok, %{fetched_fixture_count: 3, indexed_fixture_count: 2}} =
             SportmonksLiveIndex.refresh_once(fn -> {:ok, provider, rows} end,
               now_ms: now_ms,
               ttl_ms: 10_000
             )

    assert SportmonksLiveIndex.fresh_fixture?("101")
    assert SportmonksLiveIndex.fresh_fixture?("202")

    summary = SportmonksLiveIndex.summary()
    assert summary.active_fixture_count == 2
    assert summary.provider_id == provider.id

    feed_summary = SportmonksLiveIndex.summary_for_feed(feed)
    assert feed_summary.active_fixture_count == 1
    assert feed_summary.stale? == false
  end

  test "refresh_once handles cached string-key entries without crashing" do
    now_ms = System.system_time(:millisecond)

    provider =
      Repo.insert!(%Provider{
        name: "sportmonks",
        is_enabled: true,
        is_active: true,
        config: %{}
      })

    _ =
      SportmonksLiveIndex.refresh_once(fn -> {:ok, provider, []} end,
        now_ms: now_ms,
        ttl_ms: 10_000
      )

    :ets.insert(
      :sportmonks_live_index,
      {"69620",
       %{
         "fixture_id" => "69620",
         "league_id" => "1",
         "season_id" => "1795",
         "status" => "live",
         "source" => "sportmonks_livescores"
       }, now_ms + 30_000}
    )

    rows = [
      %{
        "id" => 777_001,
        "status" => "Live",
        "league_id" => 1,
        "season_id" => 1795,
        "starting_at" => "2026-04-18T10:00:00Z",
        "localteam" => %{"name" => "A"},
        "visitorteam" => %{"name" => "B"}
      }
    ]

    assert {:ok, %{indexed_fixture_count: 1}} =
             SportmonksLiveIndex.refresh_once(fn -> {:ok, provider, rows} end,
               now_ms: now_ms + 5_000,
               ttl_ms: 10_000
             )

    assert SportmonksLiveIndex.fresh_fixture?("777001")
  end
end
