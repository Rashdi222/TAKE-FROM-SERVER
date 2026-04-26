defmodule Back.Providers.ApiSportsLiveOddsIndexTest do
  use Back.DataCase, async: false

  alias Back.Providers.ApiSports
  alias Back.Betting.Match
  alias Back.Providers.ApiSportsLiveOddsIndex
  alias Back.Providers.CompetitionFeed
  alias Back.Providers.Provider
  alias Back.Repo

  test "refresh_once indexes batch live odds by fixture for enabled football odds feeds" do
    now_ms = System.system_time(:millisecond)

    provider =
      Repo.insert!(%Provider{
        name: "api_sports",
        is_enabled: true,
        is_active: true,
        config: %{}
      })

    feed =
      Repo.insert!(%CompetitionFeed{
        provider_id: provider.id,
        name: "Premier League",
        sport: "football",
        competition_key: "epl-2026",
        enabled: true,
        import_provider_odds: true,
        league_id: "39",
        season_id: "2026",
        config: %{}
      })

    _match =
      Repo.insert!(%Match{
        sport: :football,
        provider: "api_sports",
        external_id: "9001",
        competition_feed_id: feed.id,
        team1: "Alpha FC",
        team2: "Beta FC",
        start_time: DateTime.utc_now() |> DateTime.truncate(:second),
        status: :live,
        score: %{},
        raw_data: %{}
      })

    rows = [
      %{
        "id" => "9001:1:1",
        "fixture_id" => 9001,
        "league" => %{"id" => 39},
        "bookmakers" => [
          %{
            "id" => 1,
            "name" => "Book",
            "bets" => [
              %{
                "id" => 1,
                "name" => "Match Winner",
                "values" => [
                  %{"value" => "Home", "odd" => "1.80"},
                  %{"value" => "Away", "odd" => "4.20"}
                ]
              }
            ]
          }
        ]
      }
    ]

    assert {:ok, %{indexed_fixture_count: 1, fetched_market_count: 1}} =
             ApiSportsLiveOddsIndex.refresh_once(fn -> {:ok, provider, rows} end,
               now_ms: now_ms,
               ttl_ms: 60_000
             )

    assert %{fixture_id: "9001", rows: cached_rows} = ApiSportsLiveOddsIndex.get("9001")
    assert length(cached_rows) == 1

    summary = ApiSportsLiveOddsIndex.summary_for_feed(feed)
    assert summary.active_fixture_count == 1
    assert summary.stale? == false
  end

  test "live football provider odds resolve from batch cache and do not require per-match fetch" do
    now_ms = System.system_time(:millisecond)
    start_supervised!({ApiSportsLiveOddsIndex, refresh_interval_ms: 60_000})

    provider =
      Repo.insert!(%Provider{
        name: "api_sports",
        is_enabled: true,
        is_active: true,
        config: %{}
      })

    feed =
      Repo.insert!(%CompetitionFeed{
        provider_id: provider.id,
        name: "Serie A",
        sport: "football",
        competition_key: "serie-a-2026",
        enabled: true,
        import_provider_odds: true,
        league_id: "135",
        season_id: "2026",
        config: %{}
      })

    match =
      Repo.insert!(%Match{
        sport: :football,
        provider: "api_sports",
        external_id: "9101",
        competition_feed_id: feed.id,
        team1: "Roma",
        team2: "Milan",
        start_time: DateTime.utc_now() |> DateTime.truncate(:second),
        status: :live,
        score: %{},
        raw_data: %{}
      })

    rows = [
      %{
        "id" => "9101:1:1",
        "fixture_id" => 9101,
        "league" => %{"id" => 135},
        "bookmakers" => [
          %{
            "id" => 1,
            "name" => "Book",
            "bets" => [
              %{
                "id" => 1,
                "name" => "Match Winner",
                "values" => [
                  %{"value" => "Home", "odd" => "2.10"},
                  %{"value" => "Away", "odd" => "3.40"}
                ]
              }
            ]
          }
        ]
      }
    ]

    assert {:ok, _} =
             ApiSportsLiveOddsIndex.refresh_once(fn -> {:ok, provider, rows} end,
               now_ms: now_ms,
               ttl_ms: 60_000
             )

    assert {:ok, cached_rows} =
             ApiSports.fetch_odds_for_match(%{}, %{external_id: match.external_id, status: :live})

    assert length(cached_rows) == 1
  end

  test "refresh_once indexes nested fixture ids from api-sports live odds payloads" do
    now_ms = System.system_time(:millisecond)

    provider =
      Repo.insert!(%Provider{
        name: "api_sports",
        is_enabled: true,
        is_active: true,
        config: %{}
      })

    feed =
      Repo.insert!(%CompetitionFeed{
        provider_id: provider.id,
        name: "Primera C",
        sport: "football",
        competition_key: "primera-c-2026",
        enabled: true,
        import_provider_odds: true,
        league_id: "132",
        season_id: "2026",
        config: %{}
      })

    _match =
      Repo.insert!(%Match{
        sport: :football,
        provider: "api_sports",
        external_id: "1499836",
        competition_feed_id: feed.id,
        team1: "El Porvenir",
        team2: "Yupanqui",
        start_time: DateTime.utc_now() |> DateTime.truncate(:second),
        status: :live,
        score: %{},
        raw_data: %{}
      })

    rows = [
      %{
        "fixture" => %{"id" => 1_499_836},
        "league" => %{"id" => 132},
        "bookmakers" => [
          %{
            "id" => 1,
            "name" => "Book",
            "bets" => [
              %{
                "id" => 1,
                "name" => "Match Winner",
                "values" => [
                  %{"value" => "Home", "odd" => "1.88"},
                  %{"value" => "Away", "odd" => "3.95"}
                ]
              }
            ]
          }
        ]
      }
    ]

    assert {:ok, %{indexed_fixture_count: 1, fetched_market_count: 1}} =
             ApiSportsLiveOddsIndex.refresh_once(fn -> {:ok, provider, rows} end,
               now_ms: now_ms,
               ttl_ms: 60_000
             )

    assert %{fixture_id: "1499836", rows: cached_rows} = ApiSportsLiveOddsIndex.get("1499836")
    assert length(cached_rows) == 1

    summary = ApiSportsLiveOddsIndex.summary_for_feed(feed)
    assert summary.active_fixture_count == 1
    assert summary.stale? == false
  end

  test "refresh_once indexes live batch rows returned as fixture plus odds markets" do
    now_ms = System.system_time(:millisecond)

    provider =
      Repo.insert!(%Provider{
        name: "api_sports",
        is_enabled: true,
        is_active: true,
        config: %{}
      })

    feed =
      Repo.insert!(%CompetitionFeed{
        provider_id: provider.id,
        name: "Cup Live",
        sport: "football",
        competition_key: "cup-live-2026",
        enabled: true,
        import_provider_odds: true,
        league_id: "17",
        season_id: "2026",
        config: %{}
      })

    _match =
      Repo.insert!(%Match{
        sport: :football,
        provider: "api_sports",
        external_id: "1524398",
        competition_feed_id: feed.id,
        team1: "Home",
        team2: "Away",
        start_time: DateTime.utc_now() |> DateTime.truncate(:second),
        status: :live,
        score: %{},
        raw_data: %{}
      })

    rows = [
      %{
        "fixture" => %{"id" => 1_524_398},
        "league" => %{"id" => 17},
        "status" => %{"blocked" => false, "finished" => false, "stopped" => false},
        "odds" => [
          %{
            "id" => 2,
            "name" => "1x2 Extra Time",
            "values" => [
              %{"value" => "Home", "odd" => "3.40", "suspended" => false},
              %{"value" => "Draw", "odd" => "1.80", "suspended" => false},
              %{"value" => "Away", "odd" => "4.75", "suspended" => false}
            ]
          }
        ]
      }
    ]

    assert {:ok, %{indexed_fixture_count: 1, fetched_market_count: 1}} =
             ApiSportsLiveOddsIndex.refresh_once(fn -> {:ok, provider, rows} end,
               now_ms: now_ms,
               ttl_ms: 60_000
             )

    assert %{fixture_id: "1524398", rows: cached_rows} = ApiSportsLiveOddsIndex.get("1524398")
    assert length(cached_rows) == 1
    assert Enum.any?(cached_rows, &(&1["bookmaker"] == "api_sports_live"))

    summary = ApiSportsLiveOddsIndex.summary_for_feed(feed)
    assert summary.active_fixture_count == 1
    assert summary.stale? == false
  end

  test "stale cached live odds can still be read within grace window" do
    now_ms = System.system_time(:millisecond)

    provider =
      Repo.insert!(%Provider{
        name: "api_sports",
        is_enabled: true,
        is_active: true,
        config: %{}
      })

    _feed =
      Repo.insert!(%CompetitionFeed{
        provider_id: provider.id,
        name: "Grace Window League",
        sport: "football",
        competition_key: "grace-window-2026",
        enabled: true,
        import_provider_odds: true,
        league_id: "55",
        season_id: "2026",
        config: %{}
      })

    rows = [
      %{
        "fixture" => %{"id" => 777_001},
        "league" => %{"id" => 55},
        "status" => %{"blocked" => false, "finished" => false, "stopped" => false},
        "odds" => [
          %{
            "id" => 59,
            "name" => "Fulltime Result",
            "values" => [
              %{"value" => "Home", "odd" => "2.10", "suspended" => false},
              %{"value" => "Draw", "odd" => "3.05", "suspended" => false},
              %{"value" => "Away", "odd" => "3.50", "suspended" => false}
            ]
          }
        ]
      }
    ]

    assert {:ok, %{indexed_fixture_count: 1}} =
             ApiSportsLiveOddsIndex.refresh_once(fn -> {:ok, provider, rows} end,
               now_ms: now_ms,
               ttl_ms: 10
             )

    Process.sleep(25)
    assert ApiSportsLiveOddsIndex.get("777001") == nil

    cached = ApiSportsLiveOddsIndex.get("777001", allow_stale?: true, stale_grace_ms: 60_000)
    assert (cached[:fixture_id] || cached["fixture_id"]) == "777001"
  end
end
