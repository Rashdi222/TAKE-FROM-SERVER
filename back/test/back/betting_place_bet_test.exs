defmodule Back.BettingPlaceBetTest do
  use Back.DataCase, async: true

  alias Back.Accounts.User
  alias Back.Betting
  alias Back.Betting.Match
  alias Back.Betting.Odds

  test "place_in_play_bet succeeds with fresh quote context" do
    user = create_user!("1500.00")
    match = create_live_football_match!()
    odds = create_published_odds!(match, user)

    assert {:ok, %{bet: bet}} =
             Betting.place_in_play_bet(user.id, match.id, odds.id, "200.00", %{
               match_state_version: match.live_state_version,
               odds_version_no: odds.version_no,
               market_key: "match_winner",
               selection_key: "team1",
               quoted_odds_value: Decimal.to_string(odds.odds_value, :normal),
               client_snapshot: %{"source" => "test"}
             })

    assert bet.match_id == match.id
    assert bet.odds_id == odds.id
    assert bet.status == :pending
  end

  test "place_in_play_bet returns market_not_enabled without multi callback crash" do
    user = create_user!("1500.00")
    match = create_live_football_match!()
    odds = create_published_odds!(match, user)

    assert {:ok, _config} =
             Betting.upsert_sport_market_config(%{
               sport: :football,
               bet_type: :match_winner,
               default_min_odds: Decimal.new("1.01"),
               default_max_odds: Decimal.new("99.99"),
               default_max_stake_amount: Decimal.new("50000"),
               default_max_payout_amount: Decimal.new("500000"),
               is_enabled: false
             })

    assert {:error, :market_not_enabled} =
             Betting.place_in_play_bet(user.id, match.id, odds.id, "100.00", %{
               match_state_version: match.live_state_version,
               odds_version_no: odds.version_no,
               market_key: "match_winner",
               selection_key: "team1",
               quoted_odds_value: Decimal.to_string(odds.odds_value, :normal)
             })
  end

  test "place_in_play_bet returns stake_limit_exceeded from betting limits callback" do
    user = create_user!("1500.00", max_stake_per_bet: Decimal.new("50.00"))
    match = create_live_football_match!()
    odds = create_published_odds!(match, user)

    assert {:error, :stake_limit_exceeded} =
             Betting.place_in_play_bet(user.id, match.id, odds.id, "100.00", %{
               match_state_version: match.live_state_version,
               odds_version_no: odds.version_no,
               market_key: "match_winner",
               selection_key: "team1",
               quoted_odds_value: Decimal.to_string(odds.odds_value, :normal)
             })
  end

  test "list_odds_by_match prunes expired published odds in storage" do
    user = create_user!("1500.00")
    match = create_live_football_match!()

    expired_odds =
      create_published_odds!(match, user,
        provider_snapshot: %{"valid_for_ms" => 10},
        published_at:
          DateTime.add(DateTime.utc_now() |> DateTime.truncate(:second), -120, :second)
      )

    fresh_odds = create_published_odds!(match, user, source_market_key: "match_winner:alt")

    returned_ids =
      Betting.list_odds_by_match(match.id, active_only: true, visibility_status: :published)
      |> Enum.map(& &1.id)

    refute expired_odds.id in returned_ids
    assert fresh_odds.id in returned_ids

    reloaded_expired = Repo.get!(Odds, expired_odds.id)
    assert reloaded_expired.is_active == false
    assert reloaded_expired.visibility_status == :archived
  end

  test "place_in_play_bet falls back to latest platform odds for selection aliases" do
    user = create_user!("1500.00")
    match = create_live_football_match!()

    stale_odds =
      create_published_odds!(match, user,
        outcome: "Away",
        odds_value: Decimal.new("2.00"),
        version_no: 3,
        source_market_key: "match_winner"
      )

    fresh_odds =
      create_published_odds!(match, user,
        outcome: "away",
        odds_value: Decimal.new("2.10"),
        version_no: 4,
        source_market_key: "match_winner"
      )

    stale_odds
    |> Ecto.Changeset.change(is_active: false, visibility_status: :archived)
    |> Repo.update!()

    assert {:ok, %{bet: bet}} =
             Betting.place_in_play_bet(user.id, match.id, stale_odds.id, "100.00", %{
               match_state_version: match.live_state_version,
               odds_version_no: stale_odds.version_no,
               market_key: "match_winner",
               selection_key: "team2",
               quoted_odds_value: "2.00",
               client_snapshot: %{"source" => "alias-fallback-test"}
             })

    assert bet.odds_id == fresh_odds.id
    assert bet.status == :pending
  end

  defp create_user!(balance, attrs \\ %{}) do
    unique = System.unique_integer([:positive, :monotonic])

    Repo.insert!(%User{
      email: "player-#{unique}@example.com",
      password_hash: "hashed-password",
      role: :player,
      balance: Decimal.new(balance),
      account_currency: "PKR",
      is_active: true,
      max_stake_per_bet: attrs[:max_stake_per_bet],
      daily_max_exposure: attrs[:daily_max_exposure]
    })
  end

  defp create_live_football_match! do
    unique = System.unique_integer([:positive, :monotonic])

    Repo.insert!(%Match{
      sport: :football,
      provider: "api_sports",
      external_id: Integer.to_string(unique),
      team1: "Alpha FC",
      team2: "Beta FC",
      start_time: DateTime.utc_now() |> DateTime.truncate(:second),
      status: :live,
      in_play_enabled: true,
      score: %{"goals" => %{"home" => 1, "away" => 0}},
      raw_data: %{},
      live_state_version: 4,
      market_state: %{"suspended" => false},
      suspended_markets: %{}
    })
  end

  defp create_published_odds!(match, publisher, attrs \\ []) do
    attrs_map = Enum.into(attrs, %{})
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    Repo.insert!(%Odds{
      match_id: match.id,
      bet_type: :match_winner,
      outcome: Map.get(attrs_map, :outcome, "team1"),
      odds_value: Map.get(attrs_map, :odds_value, Decimal.new("2.10")),
      is_active: true,
      ai_generated: false,
      visibility_status: :published,
      version_no: Map.get(attrs_map, :version_no, 4),
      published_by_id: publisher.id,
      published_at: Map.get(attrs_map, :published_at, now),
      source_type: "platform",
      source_provider: "api_sports",
      source_market_key: Map.get(attrs_map, :source_market_key, "match_winner"),
      provider_snapshot: Map.get(attrs_map, :provider_snapshot, %{})
    })
  end
end
