defmodule Back.MarketManagerProviderReferenceTest do
  use Back.DataCase, async: true
  import Ecto.Query

  alias Back.Accounts.User
  alias Back.Betting.Match
  alias Back.Betting.Odds
  alias Back.Repo
  alias Back.State.MarketManager

  test "keep_match_suspended keeps board degraded (not fully suspended) for provider reference outages when published odds exist" do
    publisher = create_user!()
    match = create_live_match!()
    _odds = create_published_odds!(match, publisher)

    assert {:error, :provider_reference_unavailable} =
             MarketManager.keep_match_suspended(match.id, "provider_reference_unavailable", %{
               source: "test",
               trigger: "unit_test"
             })

    updated_match = Repo.get!(Match, match.id)

    assert updated_match.suspended_at == nil
    assert updated_match.suspension_reason == nil
    assert updated_match.market_state["suspended"] == false
    assert updated_match.market_state["degraded"] == true
    assert updated_match.market_state["degraded_reason"] == "provider_reference_unavailable"
  end

  test "keep_match_suspended keeps board degraded for live bootstrap recoveries when published odds exist" do
    publisher = create_user!()
    match = create_live_match!()
    _odds = create_published_odds!(match, publisher)

    assert {:error, :live_bootstrap} =
             MarketManager.keep_match_suspended(match.id, "live_bootstrap", %{
               source: "test",
               trigger: "unit_test"
             })

    updated_match = Repo.get!(Match, match.id)

    assert updated_match.suspended_at == nil
    assert updated_match.suspension_reason == nil
    assert updated_match.market_state["suspended"] == false
    assert updated_match.market_state["degraded"] == true
    assert updated_match.market_state["degraded_reason"] == "live_bootstrap"
  end

  test "keep_match_suspended keeps board degraded for stale feed guard reasons when published odds exist" do
    publisher = create_user!()
    match = create_live_match!()
    _odds = create_published_odds!(match, publisher)

    stale_reason = "stale_feed_guard:event_age=78s"

    assert {:error, :stale_feed_guard} =
             MarketManager.keep_match_suspended(match.id, stale_reason, %{
               source: "test",
               trigger: "unit_test"
             })

    updated_match = Repo.get!(Match, match.id)

    assert updated_match.suspended_at == nil
    assert updated_match.suspension_reason == nil
    assert updated_match.market_state["suspended"] == false
    assert updated_match.market_state["degraded"] == true
    assert updated_match.market_state["degraded_reason"] == stale_reason
  end

  test "keep_match_suspended keeps board degraded when only inactive published platform quotes exist" do
    publisher = create_user!()
    match = create_live_match!()
    odds = create_published_odds!(match, publisher)

    {:ok, _} =
      odds
      |> Ecto.Changeset.change(is_active: false)
      |> Repo.update()

    stale_reason = "stale_feed_guard:event_age=91s"

    assert {:error, :stale_feed_guard} =
             MarketManager.keep_match_suspended(match.id, stale_reason, %{
               source: "test",
               trigger: "unit_test"
             })

    updated_match = Repo.get!(Match, match.id)

    assert updated_match.suspended_at == nil
    assert updated_match.suspension_reason == nil
    assert updated_match.market_state["suspended"] == false
    assert updated_match.market_state["degraded"] == true
    assert updated_match.market_state["degraded_reason"] == stale_reason
  end

  test "apply_provider_reference_board deduplicates duplicate provider rows per selection and line" do
    _publisher = create_user!()
    match = create_live_match!()

    rows = [
      provider_row("match_winner", "Home", "2.10", "1",
        line: nil,
        main: true,
        bookmaker: "api_sports_live"
      ),
      provider_row("match_winner", "Home", "1.90", "1",
        line: nil,
        main: false,
        bookmaker: "bookmaker_a"
      ),
      provider_row("match_winner", "Draw", "3.20", "x",
        line: nil,
        main: true,
        bookmaker: "api_sports_live"
      ),
      provider_row("match_winner", "Away", "4.00", "2",
        line: nil,
        main: true,
        bookmaker: "api_sports_live"
      ),
      provider_row("over_under", "Over 2.5", "1.80", "over",
        line: "2.5",
        main: true,
        bookmaker: "api_sports_live"
      ),
      provider_row("over_under", "Over 2.5", "1.70", "over",
        line: "2.5",
        main: false,
        bookmaker: "bookmaker_a"
      ),
      provider_row("over_under", "Under 2.5", "2.05", "under",
        line: "2.5",
        main: true,
        bookmaker: "api_sports_live"
      )
    ]

    assert {:ok, %{odds: inserted}} =
             MarketManager.apply_provider_reference_board(match.id, "api_sports", rows, %{})

    assert length(inserted) == 5

    published =
      Repo.all(
        from o in Odds,
          where: o.match_id == ^match.id and o.visibility_status == :published,
          order_by: [asc: o.outcome]
      )

    assert length(published) == 5

    home =
      Enum.find(published, fn o ->
        o.bet_type == :match_winner and String.downcase(o.outcome || "") == "home"
      end)

    assert home
    assert Decimal.eq?(home.odds_value, Decimal.new("2.10"))
  end

  defp create_user! do
    unique = System.unique_integer([:positive, :monotonic])

    Repo.insert!(%User{
      email: "publisher-#{unique}@example.com",
      password_hash: "hashed-password",
      role: :super_admin,
      balance: Decimal.new("0.00"),
      account_currency: "PKR",
      is_active: true
    })
  end

  defp create_live_match! do
    unique = System.unique_integer([:positive, :monotonic])

    Repo.insert!(%Match{
      sport: :football,
      provider: "api_sports",
      external_id: Integer.to_string(unique),
      team1: "Home FC",
      team2: "Away FC",
      start_time: DateTime.utc_now() |> DateTime.truncate(:second),
      status: :live,
      in_play_enabled: true,
      score: %{"goals" => %{"home" => 0, "away" => 0}},
      raw_data: %{},
      live_state_version: 2,
      market_state: %{"suspended" => false},
      suspended_markets: %{}
    })
  end

  defp create_published_odds!(match, publisher) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    Repo.insert!(%Odds{
      match_id: match.id,
      bet_type: :match_winner,
      outcome: "team1",
      odds_value: Decimal.new("1.95"),
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

  defp provider_row(market_key, outcome, odds, selection_key, opts) do
    line = Keyword.get(opts, :line)
    main = Keyword.get(opts, :main, false)
    bookmaker = Keyword.get(opts, :bookmaker, "bookmaker")

    %{
      "bet_type" => market_key,
      "source_market_key" => market_key,
      "outcome" => outcome,
      "odds_value" => odds,
      "availability_status" => "active",
      "provider_snapshot" => %{
        "market" => %{"bookmaker" => bookmaker, "line" => line},
        "selection" => %{"selection_key" => selection_key, "line" => line, "main" => main}
      }
    }
  end
end
