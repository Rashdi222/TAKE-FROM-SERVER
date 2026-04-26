defmodule Back.Providers.SportmonksDetailRefresherTest do
  use Back.DataCase, async: false

  alias Back.Betting.Match
  alias Back.Betting.Odds
  alias Back.Providers.CompetitionFeed
  alias Back.Providers.Provider
  alias Back.MultiSource.Schemas.CanonicalMatch
  alias Back.MultiSource.Schemas.CanonicalTeam
  alias Back.MultiSource.Schemas.SourceMatchMapping
  alias Back.Providers.SportmonksDetailRefresher
  alias Back.Providers.SportmonksLiveIndex
  alias Back.Repo

  test "refresh_once does not suppress unchanged snapshots for placeholder-name live matches" do
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
        name: "Placeholder League",
        sport: "cricket",
        competition_key: "placeholder-2026",
        enabled: true,
        league_id: "123",
        season_id: "2026",
        generate_platform_odds: false,
        config: %{}
      })

    _match =
      Repo.insert!(%Match{
        sport: :cricket,
        provider: "sportmonks",
        external_id: "9001",
        competition_feed_id: feed.id,
        team1: "Team 1",
        team2: "Team 2",
        start_time: DateTime.utc_now() |> DateTime.truncate(:second),
        status: :live,
        in_play_enabled: true,
        score: %{},
        raw_data: %{},
        live_state_version: 0
      })

    live_row = %{
      "id" => 9001,
      "status" => "Live",
      "league_id" => 123,
      "season_id" => 2026,
      "starting_at" => "2026-04-13T10:00:00Z"
    }

    assert {:ok, _} =
             SportmonksLiveIndex.refresh_once(fn -> {:ok, provider, [live_row]} end,
               now_ms: now_ms,
               ttl_ms: 60_000
             )

    detail_without_teams = %{
      "id" => 9001,
      "status" => "Live",
      "league" => %{"id" => 123},
      "season" => %{"id" => 2026},
      "localteam_id" => 77_001,
      "visitorteam_id" => 77_002,
      "starting_at" => "2026-04-13T10:00:00Z",
      "runs" => [%{"score" => 20, "wickets" => 1}],
      "balls" => [%{"id" => 1, "ball" => 1, "over" => "2.1", "result" => "1"}]
    }

    assert {:ok, %{refreshed: 1, unchanged: 0}} =
             SportmonksDetailRefresher.refresh_once(
               fn _config, "9001" -> {:ok, detail_without_teams} end,
               now_ms: now_ms + 1_000
             )

    assert {:ok, %{refreshed: 1, unchanged: 0}} =
             SportmonksDetailRefresher.refresh_once(
               fn _config, "9001" -> {:ok, detail_without_teams} end,
               now_ms: now_ms + 20_000
             )
  end

  test "refresh_once updates live sportmonks matches from fixture detail and suppresses unchanged snapshots" do
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
        name: "IPL",
        sport: "cricket",
        competition_key: "ipl-2026",
        enabled: true,
        league_id: "77",
        season_id: "2026",
        generate_platform_odds: true,
        config: %{}
      })

    match =
      Repo.insert!(%Match{
        sport: :cricket,
        provider: "sportmonks",
        external_id: "501",
        competition_feed_id: feed.id,
        team1: "Alpha",
        team2: "Beta",
        start_time: DateTime.utc_now() |> DateTime.truncate(:second),
        status: :live,
        in_play_enabled: true,
        score: %{},
        raw_data: %{},
        live_state_version: 0,
        current_innings: 1,
        runs_total: 0,
        wickets_total: 0
      })

    live_row = %{
      "id" => 501,
      "status" => "Live",
      "league_id" => 77,
      "season_id" => 2026,
      "starting_at" => "2026-04-13T10:00:00Z",
      "localteam" => %{"name" => "Alpha"},
      "visitorteam" => %{"name" => "Beta"},
      "runs" => [%{"score" => 100, "wickets" => 2}],
      "balls" => [%{"id" => 1, "ball" => 1, "over" => "12.1", "result" => "1"}]
    }

    assert {:ok, _} =
             SportmonksLiveIndex.refresh_once(fn -> {:ok, provider, [live_row]} end,
               now_ms: now_ms,
               ttl_ms: 60_000
             )

    detail = %{
      "id" => 501,
      "status" => "Live",
      "league" => %{"id" => 77},
      "season" => %{"id" => 2026},
      "starting_at" => "2026-04-13T10:00:00Z",
      "localteam" => %{"name" => "Alpha"},
      "visitorteam" => %{"name" => "Beta"},
      "runs" => [%{"score" => 124, "wickets" => 3, "inning" => 1}],
      "balls" => [
        %{"id" => 8, "ball" => 4, "over" => "15.4", "result" => "4", "scoreboard" => "S1"}
      ],
      "batting" => [%{"active" => true, "scoreboard" => "S1"}],
      "bowling" => [%{"active" => true, "scoreboard" => "S1"}],
      "scoreboards" => [%{"type" => "S1"}]
    }

    assert {:ok, %{refreshed: 1, unchanged: 0}} =
             SportmonksDetailRefresher.refresh_once(
               fn _config, fixture_id ->
                 assert fixture_id == "501"
                 {:ok, detail}
               end,
               now_ms: now_ms + 1_000
             )

    updated_match = Repo.get!(Match, match.id)
    assert updated_match.runs_total == 124
    assert updated_match.wickets_total == 3

    assert {:ok, %{refreshed: 0, unchanged: 1}} =
             SportmonksDetailRefresher.refresh_once(fn _config, _fixture_id -> {:ok, detail} end,
               now_ms: now_ms + 20_000
             )

    summary = SportmonksDetailRefresher.summary_for_feed(feed)
    assert summary.tracked_match_count == 1
    assert summary.unchanged_count == 1
  end

  test "refresh_once applies unchanged cooldown and skips refetch until cooldown expires" do
    now_ms = System.system_time(:millisecond)
    parent = self()

    previous_multiplier =
      Application.get_env(:back, :sportmonks_detail_refresh_unchanged_cooldown_multiplier)

    on_exit(fn ->
      Application.put_env(
        :back,
        :sportmonks_detail_refresh_unchanged_cooldown_multiplier,
        previous_multiplier
      )
    end)

    Application.put_env(:back, :sportmonks_detail_refresh_unchanged_cooldown_multiplier, 10)

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
        league_id: "99",
        season_id: "2026",
        generate_platform_odds: false,
        config: %{}
      })

    _match =
      Repo.insert!(%Match{
        sport: :cricket,
        provider: "sportmonks",
        external_id: "701",
        competition_feed_id: feed.id,
        team1: "Gamma",
        team2: "Delta",
        start_time: DateTime.utc_now() |> DateTime.truncate(:second),
        status: :live,
        in_play_enabled: true,
        score: %{},
        raw_data: %{},
        live_state_version: 0,
        current_innings: 1,
        runs_total: 0,
        wickets_total: 0
      })

    live_row = %{
      "id" => 701,
      "status" => "Live",
      "league_id" => 99,
      "season_id" => 2026,
      "starting_at" => "2026-04-13T10:00:00Z",
      "localteam" => %{"name" => "Gamma"},
      "visitorteam" => %{"name" => "Delta"},
      "runs" => [%{"score" => 100, "wickets" => 2}],
      "balls" => [%{"id" => 1, "ball" => 1, "over" => "12.1", "result" => "1"}]
    }

    assert {:ok, _} =
             SportmonksLiveIndex.refresh_once(fn -> {:ok, provider, [live_row]} end,
               now_ms: now_ms,
               ttl_ms: 60_000
             )

    detail = %{
      "id" => 701,
      "status" => "Live",
      "league" => %{"id" => 99},
      "season" => %{"id" => 2026},
      "starting_at" => "2026-04-13T10:00:00Z",
      "localteam" => %{"name" => "Gamma"},
      "visitorteam" => %{"name" => "Delta"},
      "runs" => [%{"score" => 124, "wickets" => 3, "inning" => 1}],
      "balls" => [
        %{"id" => 8, "ball" => 4, "over" => "15.4", "result" => "4", "scoreboard" => "S1"}
      ],
      "batting" => [%{"active" => true, "scoreboard" => "S1"}],
      "bowling" => [%{"active" => true, "scoreboard" => "S1"}],
      "scoreboards" => [%{"type" => "S1"}]
    }

    assert {:ok, %{refreshed: 1}} =
             SportmonksDetailRefresher.refresh_once(
               fn _config, fixture_id ->
                 send(parent, {:fetched, fixture_id})
                 {:ok, detail}
               end,
               now_ms: now_ms + 1_000
             )

    assert_receive {:fetched, "701"}

    assert {:ok, %{unchanged: 1}} =
             SportmonksDetailRefresher.refresh_once(
               fn _config, fixture_id ->
                 send(parent, {:fetched, fixture_id})
                 {:ok, detail}
               end,
               now_ms: now_ms + 20_000
             )

    assert_receive {:fetched, "701"}

    assert {:ok, %{selected: 0, evaluated: 0}} =
             SportmonksDetailRefresher.refresh_once(
               fn _config, fixture_id ->
                 send(parent, {:fetched, fixture_id})
                 {:ok, detail}
               end,
               now_ms: now_ms + 40_000
             )

    refute_receive {:fetched, "701"}, 50

    assert {:ok, %{selected: 0, evaluated: 0}} =
             SportmonksDetailRefresher.refresh_once(
               fn _config, fixture_id ->
                 send(parent, {:fetched, fixture_id})
                 {:ok, detail}
               end,
               now_ms: now_ms + 55_000
             )

    refute_receive {:fetched, "701"}, 50

    assert {:ok, %{selected: 1}} =
             SportmonksDetailRefresher.refresh_once(
               fn _config, fixture_id ->
                 send(parent, {:fetched, fixture_id})
                 {:ok, detail}
               end,
               now_ms: now_ms + 75_000
             )

    assert_receive {:fetched, "701"}
  end

  test "refresh_once prioritizes mapped matches and reports throttled work under budget" do
    now_ms = System.system_time(:millisecond)
    parent = self()

    previous_limit = Application.get_env(:back, :sportmonks_detail_refresh_max_targets_per_tick)

    on_exit(fn ->
      Application.put_env(:back, :sportmonks_detail_refresh_max_targets_per_tick, previous_limit)
    end)

    Application.put_env(:back, :sportmonks_detail_refresh_max_targets_per_tick, 1)

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
        name: "CPL",
        sport: "cricket",
        competition_key: "cpl-2026",
        enabled: true,
        league_id: "88",
        season_id: "2026",
        generate_platform_odds: false,
        config: %{}
      })

    _mapped_match =
      Repo.insert!(%Match{
        sport: :cricket,
        provider: "sportmonks",
        external_id: "801",
        competition_feed_id: feed.id,
        team1: "Mapped A",
        team2: "Mapped B",
        start_time: DateTime.utc_now() |> DateTime.truncate(:second),
        status: :live,
        in_play_enabled: true,
        score: %{},
        raw_data: %{},
        live_state_version: 0
      })

    _plain_match =
      Repo.insert!(%Match{
        sport: :cricket,
        provider: "sportmonks",
        external_id: "802",
        competition_feed_id: feed.id,
        team1: "Plain A",
        team2: "Plain B",
        start_time: DateTime.utc_now() |> DateTime.truncate(:second),
        status: :live,
        in_play_enabled: true,
        score: %{},
        raw_data: %{},
        live_state_version: 0
      })

    home_team = Repo.insert!(%CanonicalTeam{sport: "cricket", name: "Mapped A"})
    away_team = Repo.insert!(%CanonicalTeam{sport: "cricket", name: "Mapped B"})

    canonical_match =
      Repo.insert!(%CanonicalMatch{
        sport: "cricket",
        competition_name: "CPL",
        start_time: DateTime.utc_now() |> DateTime.truncate(:second),
        anchor_source_name: "sportmonks",
        anchor_source_match_id: "801",
        status: "live",
        home_team_id: home_team.id,
        away_team_id: away_team.id
      })

    Repo.insert!(%SourceMatchMapping{
      canonical_match_id: canonical_match.id,
      source_name: "one_x_bet_worker",
      source_match_id: "999801",
      mapping_status: "manual_confirmed",
      matched_via: "manual_admin"
    })

    live_rows = [
      %{
        "id" => 801,
        "status" => "Live",
        "league_id" => 88,
        "season_id" => 2026,
        "starting_at" => "2026-04-13T10:00:00Z",
        "localteam" => %{"name" => "Mapped A"},
        "visitorteam" => %{"name" => "Mapped B"},
        "runs" => [%{"score" => 100, "wickets" => 2}],
        "balls" => [%{"id" => 1, "ball" => 1, "over" => "12.1", "result" => "1"}]
      },
      %{
        "id" => 802,
        "status" => "Live",
        "league_id" => 88,
        "season_id" => 2026,
        "starting_at" => "2026-04-13T10:00:00Z",
        "localteam" => %{"name" => "Plain A"},
        "visitorteam" => %{"name" => "Plain B"},
        "runs" => [%{"score" => 100, "wickets" => 2}],
        "balls" => [%{"id" => 1, "ball" => 1, "over" => "12.1", "result" => "1"}]
      }
    ]

    assert {:ok, _} =
             SportmonksLiveIndex.refresh_once(fn -> {:ok, provider, live_rows} end,
               now_ms: now_ms,
               ttl_ms: 60_000
             )

    detail = %{
      "status" => "Live",
      "league" => %{"id" => 88},
      "season" => %{"id" => 2026},
      "starting_at" => "2026-04-13T10:00:00Z",
      "localteam" => %{"name" => "Mapped A"},
      "visitorteam" => %{"name" => "Mapped B"},
      "runs" => [%{"score" => 124, "wickets" => 3, "inning" => 1}],
      "balls" => [
        %{"id" => 8, "ball" => 4, "over" => "15.4", "result" => "4", "scoreboard" => "S1"}
      ],
      "batting" => [%{"active" => true, "scoreboard" => "S1"}],
      "bowling" => [%{"active" => true, "scoreboard" => "S1"}],
      "scoreboards" => [%{"type" => "S1"}]
    }

    assert {:ok, %{evaluated: 2, selected: 1, throttled: 1, refreshed: 1, hot: 1}} =
             SportmonksDetailRefresher.refresh_once(
               fn _config, fixture_id ->
                 send(parent, {:picked, fixture_id})
                 {:ok, Map.put(detail, "id", String.to_integer(fixture_id))}
               end,
               now_ms: now_ms + 1_000
             )

    assert_receive {:picked, "801"}
    refute_receive {:picked, "802"}, 50

    summary = SportmonksDetailRefresher.summary_for_feed(feed)
    assert summary.throttled_count == 1
    assert summary.hot_target_count == 1
  end

  test "refresh_once prioritizes live bootstrap targets without published platform odds" do
    now_ms = System.system_time(:millisecond)
    parent = self()

    previous_limit = Application.get_env(:back, :sportmonks_detail_refresh_max_targets_per_tick)

    on_exit(fn ->
      Application.put_env(:back, :sportmonks_detail_refresh_max_targets_per_tick, previous_limit)
    end)

    Application.put_env(:back, :sportmonks_detail_refresh_max_targets_per_tick, 1)

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
        name: "Bootstrap League",
        sport: "cricket",
        competition_key: "bootstrap-2026",
        enabled: true,
        league_id: "71",
        season_id: "2026",
        generate_platform_odds: false,
        config: %{}
      })

    with_odds_match =
      Repo.insert!(%Match{
        sport: :cricket,
        provider: "sportmonks",
        external_id: "9101",
        competition_feed_id: feed.id,
        team1: "With Odds A",
        team2: "With Odds B",
        start_time: DateTime.utc_now() |> DateTime.truncate(:second),
        status: :live,
        in_play_enabled: true,
        score: %{},
        raw_data: %{},
        live_state_version: 0
      })

    _without_odds_match =
      Repo.insert!(%Match{
        sport: :cricket,
        provider: "sportmonks",
        external_id: "9102",
        competition_feed_id: feed.id,
        team1: "No Odds A",
        team2: "No Odds B",
        start_time: DateTime.utc_now() |> DateTime.truncate(:second),
        status: :live,
        in_play_enabled: true,
        score: %{},
        raw_data: %{},
        live_state_version: 0
      })

    Repo.insert!(%Odds{
      match_id: with_odds_match.id,
      bet_type: :match_winner,
      outcome: "team1",
      odds_value: Decimal.new("1.90"),
      is_active: true,
      visibility_status: :published,
      source_type: "platform",
      version_no: 1
    })

    live_rows = [
      %{
        "id" => 9101,
        "status" => "Live",
        "league_id" => 71,
        "season_id" => 2026,
        "starting_at" => "2026-04-13T10:00:00Z"
      },
      %{
        "id" => 9102,
        "status" => "Live",
        "league_id" => 71,
        "season_id" => 2026,
        "starting_at" => "2026-04-13T10:00:00Z"
      }
    ]

    assert {:ok, _} =
             SportmonksLiveIndex.refresh_once(fn -> {:ok, provider, live_rows} end,
               now_ms: now_ms,
               ttl_ms: 60_000
             )

    detail = %{
      "status" => "Live",
      "league" => %{"id" => 71},
      "season" => %{"id" => 2026},
      "starting_at" => "2026-04-13T10:00:00Z",
      "runs" => [%{"score" => 10, "wickets" => 0, "inning" => 1}],
      "balls" => [%{"id" => 1, "ball" => 1, "over" => "1.1", "result" => "1"}]
    }

    assert {:ok, %{evaluated: 2, selected: 1, throttled: 1, refreshed: 1}} =
             SportmonksDetailRefresher.refresh_once(
               fn _config, fixture_id ->
                 send(parent, {:picked_fixture, fixture_id})
                 {:ok, Map.put(detail, "id", String.to_integer(fixture_id))}
               end,
               now_ms: now_ms + 1_000
             )

    assert_receive {:picked_fixture, "9102"}
    refute_receive {:picked_fixture, "9101"}, 50
  end
end
