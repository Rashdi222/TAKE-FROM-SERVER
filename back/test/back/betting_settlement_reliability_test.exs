defmodule Back.BettingSettlementReliabilityTest do
  use Back.DataCase, async: true
  import Ecto.Query

  alias Back.Accounts.{Transaction, User}
  alias Back.Betting
  alias Back.Betting.{Bet, Match, Odds}

  test "settle_match records bet_lost transaction and does not credit balance for losing bet" do
    user = create_user!("1000.00")
    match = create_closed_match!()
    odds = create_published_odds!(match, user, outcome: "team2", odds_value: Decimal.new("2.40"))
    bet = create_pending_bet!(user, match, odds, "100.00", "240.00")

    assert {:ok, _} = Betting.settle_match(match, "team1")

    settled_bet = Repo.get!(Bet, bet.id)
    reloaded_user = Repo.get!(User, user.id)

    assert settled_bet.status == :lost
    assert Decimal.eq?(reloaded_user.balance, Decimal.new("1000.00"))

    lost_tx =
      Repo.one!(
        from t in Transaction,
          where: t.reference_id == ^bet.id and t.transaction_type == :bet_lost,
          limit: 1
      )

    assert Decimal.eq?(lost_tx.amount, Decimal.new("100.00"))
  end

  test "cancel_bet refunds once and becomes non-cancellable" do
    user = create_user!("1000.00")
    match = create_live_match!()
    odds = create_published_odds!(match, user)
    bet = create_pending_bet!(user, match, odds, "120.00", "252.00")

    assert {:ok, _} = Betting.cancel_bet(bet)

    reloaded_user = Repo.get!(User, user.id)
    cancelled_bet = Repo.get!(Bet, bet.id)

    assert cancelled_bet.status == :cancelled
    assert Decimal.eq?(reloaded_user.balance, Decimal.new("1120.00"))

    assert {:error, :bet_not_cancellable} = Betting.cancel_bet(cancelled_bet)
  end

  defp create_user!(balance) do
    unique = System.unique_integer([:positive, :monotonic])

    Repo.insert!(%User{
      email: "settle-player-#{unique}@example.com",
      password_hash: "hashed-password",
      role: :player,
      balance: Decimal.new(balance),
      account_currency: "PKR",
      is_active: true
    })
  end

  defp create_closed_match! do
    unique = System.unique_integer([:positive, :monotonic])

    Repo.insert!(%Match{
      sport: :football,
      provider: "api_sports",
      external_id: "closed-#{unique}",
      team1: "Alpha FC",
      team2: "Beta FC",
      start_time: DateTime.utc_now() |> DateTime.truncate(:second),
      status: :closed,
      in_play_enabled: false,
      score: %{"goals" => %{"home" => 2, "away" => 1}},
      raw_data: %{}
    })
  end

  defp create_live_match! do
    unique = System.unique_integer([:positive, :monotonic])

    Repo.insert!(%Match{
      sport: :football,
      provider: "api_sports",
      external_id: "live-#{unique}",
      team1: "Gamma FC",
      team2: "Delta FC",
      start_time: DateTime.utc_now() |> DateTime.truncate(:second),
      status: :live,
      in_play_enabled: true,
      score: %{"goals" => %{"home" => 1, "away" => 0}},
      raw_data: %{},
      market_state: %{"suspended" => false}
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
      version_no: 1,
      published_by_id: publisher.id,
      published_at: now,
      source_type: "platform",
      source_provider: "api_sports",
      source_market_key: "match_winner",
      provider_snapshot: %{}
    })
  end

  defp create_pending_bet!(user, match, odds, stake, potential_win) do
    Repo.insert!(%Bet{
      user_id: user.id,
      match_id: match.id,
      odds_id: odds.id,
      stake: Decimal.new(stake),
      potential_win: Decimal.new(potential_win),
      status: :pending,
      is_in_play: false,
      match_state_version: 0,
      odds_version_no: odds.version_no,
      market_key: "match_winner",
      selection_key: odds.outcome,
      quoted_odds_value: odds.odds_value,
      accepted_at: DateTime.utc_now() |> DateTime.truncate(:second),
      client_snapshot: %{"source" => "test"}
    })
  end
end
