defmodule Back.Betting do
  import Ecto.Query
  alias Back.Repo
  alias Back.Admin
  alias Back.AI.OddsRules
  alias Back.Analytics
  alias Back.Accounts.{User, Transaction}
  alias Back.Betting.MarketSettlement.InPlay.Cricket, as: CricketInPlaySettlement
  alias Back.Betting.MarketSettlement.InPlay.Football, as: FootballInPlaySettlement
  alias Back.Betting.MarketSettlement.InPlay.Tennis, as: TennisInPlaySettlement
  alias Back.Betting.MatchSlug
  alias Back.Betting.MarketSettlement.Racing, as: RacingSettlement
  alias Back.Betting.MarketSettlement.Tennis, as: TennisSettlement
  alias Back.Betting.OddsLifecycle
  alias Back.Betting.{Match, Odds, Bet, BetRejectionLog, SportMarketConfig}

  @type execution_context :: %{
          optional(:match_state_version) => integer() | String.t(),
          optional(:odds_version_no) => integer() | String.t(),
          optional(:market_key) => String.t(),
          optional(:selection_key) => String.t(),
          optional(:quoted_odds_value) => Decimal.t() | integer() | float() | String.t(),
          optional(:client_snapshot) => map()
        }

  # ── Matches ───────────────────────────────────────────────────────────────────

  def list_matches(filters \\ []) do
    Match
    |> apply_match_filters(filters)
    |> order_by([m], asc: m.start_time)
    |> apply_match_offset(filters)
    |> apply_match_limit(filters)
    |> Repo.all()
  end

  def list_match_competition_aggregates(filters \\ []) do
    Match
    |> apply_match_filters(Keyword.drop(filters, [:limit, :offset]))
    |> group_by(
      [m],
      [
        m.sport,
        m.competition_feed_id,
        fragment("?->'_competition_feed'->>'competition_key'", m.raw_data),
        fragment("?->'_competition_feed'->>'name'", m.raw_data)
      ]
    )
    |> select([m], %{
      sport: m.sport,
      competition_feed_id: m.competition_feed_id,
      competition_key: fragment("?->'_competition_feed'->>'competition_key'", m.raw_data),
      name: fragment("?->'_competition_feed'->>'name'", m.raw_data),
      match_count: count(m.id),
      next_match_time: min(m.start_time)
    })
    |> order_by([m], asc: m.sport, asc: fragment("?->'_competition_feed'->>'name'", m.raw_data))
    |> Repo.all()
  end

  def get_match!(id), do: Repo.get!(Match, id)

  def get_match_by_public_ref!(id, slug \\ nil) when is_binary(id) do
    match = Repo.get!(Match, id)

    if is_binary(slug) and String.trim(slug) != "" and match.slug != slug do
      raise Ecto.NoResultsError, queryable: Match
    end

    match
  end

  def create_match(attrs, created_by_id) do
    %Match{}
    |> Match.changeset(Map.put(attrs, "created_by_id", created_by_id))
    |> Repo.insert()
  end

  def update_match(%Match{} = match, attrs) do
    match |> Match.changeset(attrs) |> Repo.update()
  end

  @doc """
  Upserts a normalized provider match using provider+external_id as the key.
  """
  def upsert_external_match(attrs) when is_map(attrs) do
    attrs =
      attrs
      |> normalize_external_match_attrs()
      |> sanitize_external_match_json_attrs()

    attrs =
      if attrs.status == :live do
        Map.put(attrs, :last_live_event_at, DateTime.utc_now() |> DateTime.truncate(:second))
      else
        attrs
      end

    if is_binary(attrs.provider) and is_binary(attrs.external_id) and attrs.external_id != "" do
      previous_match = find_existing_external_match(attrs.provider, attrs.external_id)
      attrs = preserve_enriched_context(attrs, previous_match)

      %Match{}
      |> Match.changeset(attrs)
      |> Repo.insert(
        on_conflict: [
          set: [
            sport: attrs.sport,
            slug: attrs.slug,
            competition_feed_id: attrs.competition_feed_id,
            team1: attrs.team1,
            team2: attrs.team2,
            start_time: attrs.start_time,
            status: attrs.status,
            in_play_enabled: attrs.in_play_enabled,
            score: attrs.score,
            raw_data: attrs.raw_data,
            live_state_version: attrs.live_state_version,
            current_innings: attrs.current_innings,
            current_over: attrs.current_over,
            current_ball_in_over: attrs.current_ball_in_over,
            batting_team: attrs.batting_team,
            bowling_team: attrs.bowling_team,
            runs_total: attrs.runs_total,
            wickets_total: attrs.wickets_total,
            target_runs: attrs.target_runs,
            required_run_rate: attrs.required_run_rate,
            current_run_rate: attrs.current_run_rate,
            elapsed_minute: attrs.elapsed_minute,
            stoppage_minute: attrs.stoppage_minute,
            home_score: attrs.home_score,
            away_score: attrs.away_score,
            home_red_cards: attrs.home_red_cards,
            away_red_cards: attrs.away_red_cards,
            home_corners: attrs.home_corners,
            away_corners: attrs.away_corners,
            home_shots_on_target: attrs.home_shots_on_target,
            away_shots_on_target: attrs.away_shots_on_target,
            tempo_index: attrs.tempo_index,
            market_state: attrs.market_state,
            last_ball_event_type: attrs.last_ball_event_type,
            last_live_event_at: attrs.last_live_event_at,
            updated_at: DateTime.utc_now() |> DateTime.truncate(:second)
          ]
        ],
        conflict_target: [:provider, :external_id],
        returning: true
      )
      |> OddsLifecycle.sync_after_write(previous_match)
    else
      {:error, :invalid_external_match}
    end
  end

  defp preserve_enriched_context(attrs, nil) do
    incoming_raw = normalize_map_snapshot(attrs.raw_data || %{})
    provider = attrs[:provider] || attrs["provider"]
    sport = attrs[:sport] || attrs["sport"]
    incoming_team1 = attrs[:team1] || attrs["team1"]
    incoming_team2 = attrs[:team2] || attrs["team2"]

    resolved_team1 =
      cond do
        not placeholder_team_name?(incoming_team1) ->
          incoming_team1

        not placeholder_team_name?(team_name_from_raw(incoming_raw, :home)) ->
          team_name_from_raw(incoming_raw, :home)

        not placeholder_team_name?(resolve_team_name_by_id(provider, sport, incoming_raw, :home)) ->
          resolve_team_name_by_id(provider, sport, incoming_raw, :home)

        true ->
          incoming_team1
      end

    resolved_team2 =
      cond do
        not placeholder_team_name?(incoming_team2) ->
          incoming_team2

        not placeholder_team_name?(team_name_from_raw(incoming_raw, :away)) ->
          team_name_from_raw(incoming_raw, :away)

        not placeholder_team_name?(resolve_team_name_by_id(provider, sport, incoming_raw, :away)) ->
          resolve_team_name_by_id(provider, sport, incoming_raw, :away)

        true ->
          incoming_team2
      end

    %{attrs | raw_data: incoming_raw, team1: resolved_team1, team2: resolved_team2}
  end

  defp preserve_enriched_context(attrs, %Match{} = previous_match) do
    previous_raw = normalize_map_snapshot(previous_match.raw_data || %{})
    incoming_raw = normalize_map_snapshot(attrs.raw_data || %{})
    provider = attrs[:provider] || attrs["provider"] || previous_match.provider
    sport = attrs[:sport] || attrs["sport"] || previous_match.sport

    preserved_context =
      previous_raw
      |> Map.take(["football_context", "_competition_feed"])
      |> Enum.reduce(%{}, fn {key, value}, acc ->
        if Map.has_key?(incoming_raw, key) do
          acc
        else
          Map.put(acc, key, value)
        end
      end)

    preserved_feed_id =
      attrs[:competition_feed_id] ||
        attrs["competition_feed_id"] ||
        previous_match.competition_feed_id

    incoming_team1 = attrs[:team1] || attrs["team1"]
    incoming_team2 = attrs[:team2] || attrs["team2"]

    raw_team1 = team_name_from_raw(incoming_raw, :home)
    raw_team2 = team_name_from_raw(incoming_raw, :away)

    team1_by_id = resolve_team_name_by_id(provider, sport, incoming_raw, :home)
    team2_by_id = resolve_team_name_by_id(provider, sport, incoming_raw, :away)

    preserved_team1 =
      cond do
        not placeholder_team_name?(incoming_team1) ->
          incoming_team1

        not placeholder_team_name?(raw_team1) ->
          raw_team1

        not placeholder_team_name?(previous_match.team1) ->
          previous_match.team1

        not placeholder_team_name?(team1_by_id) ->
          team1_by_id

        true ->
          incoming_team1
      end

    preserved_team2 =
      cond do
        not placeholder_team_name?(incoming_team2) ->
          incoming_team2

        not placeholder_team_name?(raw_team2) ->
          raw_team2

        not placeholder_team_name?(previous_match.team2) ->
          previous_match.team2

        not placeholder_team_name?(team2_by_id) ->
          team2_by_id

        true ->
          incoming_team2
      end

    %{
      attrs
      | raw_data: Map.merge(incoming_raw, preserved_context),
        competition_feed_id: preserved_feed_id,
        team1: preserved_team1,
        team2: preserved_team2
    }
  end

  defp placeholder_team_name?(value) do
    normalized = value |> to_string() |> String.trim() |> String.downcase()
    normalized in ["", "team 1", "team 2", "unknown team"]
  end

  defp team_name_from_raw(raw, :home) when is_map(raw) do
    raw["team1"] ||
      get_in(raw, ["localteam", "name"]) ||
      get_in(raw, ["localTeam", "name"]) ||
      get_in(raw, ["home_team", "name"])
  end

  defp team_name_from_raw(raw, :away) when is_map(raw) do
    raw["team2"] ||
      get_in(raw, ["visitorteam", "name"]) ||
      get_in(raw, ["visitorTeam", "name"]) ||
      get_in(raw, ["away_team", "name"])
  end

  defp team_name_from_raw(_, _), do: nil

  defp resolve_team_name_by_id(provider, sport, raw, side)
       when is_binary(provider) and is_map(raw) and side in [:home, :away] do
    team_id = team_id_from_raw(raw, side)

    if is_binary(team_id) and team_id != "" do
      find_team_name_from_match_history(provider, sport, side, team_id)
    else
      nil
    end
  end

  defp resolve_team_name_by_id(_, _, _, _), do: nil

  defp team_id_from_raw(raw, :home) do
    stringify_team_id(
      raw["localteam_id"] ||
        get_in(raw, ["localteam", "id"]) ||
        get_in(raw, ["localTeam", "id"]) ||
        get_in(raw, ["home_team", "id"])
    )
  end

  defp team_id_from_raw(raw, :away) do
    stringify_team_id(
      raw["visitorteam_id"] ||
        get_in(raw, ["visitorteam", "id"]) ||
        get_in(raw, ["visitorTeam", "id"]) ||
        get_in(raw, ["away_team", "id"])
    )
  end

  defp stringify_team_id(nil), do: nil
  defp stringify_team_id(value) when is_binary(value), do: String.trim(value)
  defp stringify_team_id(value) when is_integer(value), do: Integer.to_string(value)
  defp stringify_team_id(value), do: value |> to_string() |> String.trim()

  defp find_team_name_from_match_history(provider, sport, :home, team_id) do
    Repo.one(
      from m in Match,
        where: m.provider == ^provider and m.sport == ^sport,
        where:
          fragment("?->>'localteam_id' = ?", m.raw_data, ^team_id) or
            fragment("?->'localteam'->>'id' = ?", m.raw_data, ^team_id) or
            fragment("?->'localTeam'->>'id' = ?", m.raw_data, ^team_id),
        where:
          fragment(
            "lower(trim(?)) not in ('', 'team 1', 'team 2', 'unknown team')",
            m.team1
          ),
        order_by: [desc: m.updated_at],
        limit: 1,
        select: m.team1
    )
  end

  defp find_team_name_from_match_history(provider, sport, :away, team_id) do
    Repo.one(
      from m in Match,
        where: m.provider == ^provider and m.sport == ^sport,
        where:
          fragment("?->>'visitorteam_id' = ?", m.raw_data, ^team_id) or
            fragment("?->'visitorteam'->>'id' = ?", m.raw_data, ^team_id) or
            fragment("?->'visitorTeam'->>'id' = ?", m.raw_data, ^team_id),
        where:
          fragment(
            "lower(trim(?)) not in ('', 'team 1', 'team 2', 'unknown team')",
            m.team2
          ),
        order_by: [desc: m.updated_at],
        limit: 1,
        select: m.team2
    )
  end

  def change_match_status(%Match{} = match, status) do
    previous_match = match

    match
    |> Ecto.Changeset.change(status: status, in_play_enabled: status == :live)
    |> Repo.update()
    |> OddsLifecycle.sync_after_write(previous_match)
  end

  @doc "Transitions an upcoming match to live, enabling in-play betting."
  def start_live(%Match{status: :upcoming} = match) do
    previous_match = match

    case match
         |> Ecto.Changeset.change(status: :live, in_play_enabled: true)
         |> Repo.update()
         |> OddsLifecycle.sync_after_write(previous_match) do
      {:ok, updated} = ok ->
        BackWeb.MatchChannel.broadcast_status_change(updated.id, :live)
        ok

      err ->
        err
    end
  end

  def start_live(_), do: {:error, :invalid_state_transition}

  @doc "Closes betting on a live or upcoming match."
  def close_match(%Match{status: s} = match) when s in [:upcoming, :live] do
    previous_match = match

    match
    |> Ecto.Changeset.change(status: :closed, in_play_enabled: false)
    |> Repo.update()
    |> OddsLifecycle.sync_after_write(previous_match)
  end

  def close_match(_), do: {:error, :invalid_state_transition}

  @doc "Cancels a match that has not yet been settled. Refunds all pending bets."
  def cancel_match(%Match{status: s} = match) when s in [:upcoming, :live, :closed] do
    previous_match = match

    result =
      Ecto.Multi.new()
      |> Ecto.Multi.update(
        :match,
        Ecto.Changeset.change(match, status: :cancelled, in_play_enabled: false)
      )
      |> Ecto.Multi.run(:refund_bets, fn _repo, _changes ->
        pending = Repo.all(from b in Bet, where: b.match_id == ^match.id and b.status == :pending)
        Enum.each(pending, &cancel_bet/1)
        {:ok, length(pending)}
      end)
      |> Repo.transaction()
      |> OddsLifecycle.sync_after_transaction(previous_match)

    case result do
      {:ok, %{match: cancelled} = payload} ->
        _ = Analytics.resolve_cricket_quote_audits_for_match(cancelled)
        {:ok, payload}

      other ->
        other
    end
  end

  def cancel_match(_), do: {:error, :invalid_state_transition}

  def settle_match(%Match{status: :closed} = match, winner) do
    result =
      Ecto.Multi.new()
      |> Ecto.Multi.update(:match, Match.settle_changeset(match, winner))
      |> Ecto.Multi.run(:settle_bets, fn _repo, %{match: settled_match} ->
        settle_match_bets(settled_match)
      end)
      |> Ecto.Multi.run(:commission, fn _repo, %{match: settled_match} ->
        calculate_and_pay_commission(settled_match.id)
        {:ok, :done}
      end)
      |> Repo.transaction()

    case result do
      {:ok, %{match: settled}} = ok ->
        _ = OddsLifecycle.deactivate_all_active_odds(settled.id)
        _ = Analytics.resolve_cricket_quote_audits_for_match(settled)
        BackWeb.MatchChannel.broadcast_status_change(settled.id, :settled)
        BackWeb.MatchChannel.broadcast_winner(settled.id, winner)
        ok

      err ->
        err
    end
  end

  def settle_match(_, _), do: {:error, :invalid_state_transition}

  # ── Sport Market Configs ─────────────────────────────────────────────────────

  def list_sport_market_configs(filters \\ []) do
    SportMarketConfig
    |> apply_sport_market_config_filters(filters)
    |> order_by([c], asc: c.sport, asc: c.bet_type)
    |> Repo.all()
  end

  def upsert_sport_market_config(attrs) do
    min_odds = attr_val(attrs, :default_min_odds)
    max_odds = attr_val(attrs, :default_max_odds)
    max_stake_amount = attr_val(attrs, :default_max_stake_amount)
    max_payout_amount = attr_val(attrs, :default_max_payout_amount)
    is_enabled = attr_val(attrs, :is_enabled)

    %SportMarketConfig{}
    |> SportMarketConfig.changeset(attrs)
    |> Repo.insert(
      on_conflict: [
        set: [
          default_min_odds: min_odds,
          default_max_odds: max_odds,
          default_max_stake_amount: max_stake_amount,
          default_max_payout_amount: max_payout_amount,
          is_enabled: is_enabled,
          updated_at: DateTime.utc_now() |> DateTime.truncate(:second)
        ]
      ],
      conflict_target: [:sport, :bet_type],
      returning: true
    )
  end

  def get_sport_market_config(sport, bet_type) do
    Repo.get_by(SportMarketConfig, sport: sport, bet_type: bet_type, is_enabled: true)
  end

  # ── Odds ──────────────────────────────────────────────────────────────────────

  def list_odds_by_match(match_id, filters \\ []) do
    include_unpublished =
      Enum.any?(filters, fn
        {:include_unpublished, true} -> true
        _ -> false
      end)

    Odds
    |> where([o], o.match_id == ^match_id)
    |> maybe_only_published(include_unpublished)
    |> maybe_only_bettable(include_unpublished)
    |> apply_odds_filters(filters)
    |> Repo.all()
    |> filter_expired_published_odds()
  end

  def get_odds!(id), do: Repo.get!(Odds, id)

  def create_odds(attrs) do
    match = get_match!(attrs["match_id"] || attrs[:match_id])

    with :ok <- ensure_match_accepting_odds(match),
         :ok <- validate_odds_for_match(match, attrs) do
      %Odds{} |> Odds.changeset(attrs) |> Repo.insert()
    end
  end

  def update_odds(%Odds{} = odds, attrs) do
    match = get_match!(odds.match_id)

    with :ok <- ensure_match_accepting_odds(match),
         :ok <- validate_odds_for_match(match, attrs, odds) do
      odds |> Odds.changeset(attrs) |> Repo.update()
    end
  end

  def set_odds_active(%Odds{} = odds, active) do
    match = get_match!(odds.match_id)

    if match.status in [:settled, :cancelled] do
      {:error, :match_not_accepting_odds}
    else
      odds |> Ecto.Changeset.change(is_active: active) |> Repo.update()
    end
  end

  def publish_match_odds(match_id, published_by_id, audit_meta \\ %{}) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    latest_version = get_latest_draft_version(match_id)

    result =
      Ecto.Multi.new()
      |> Ecto.Multi.update_all(
        :archive_old_published,
        from(o in Odds,
          where:
            o.match_id == ^match_id and o.visibility_status == :published and
              o.source_type == "platform"
        ),
        set: [visibility_status: :archived, updated_at: now]
      )
      |> Ecto.Multi.update_all(
        :publish_latest_drafts,
        from(o in Odds,
          where:
            o.match_id == ^match_id and o.visibility_status == :draft and
              o.version_no == ^latest_version and o.source_type == "platform"
        ),
        set: [
          visibility_status: :published,
          published_by_id: published_by_id,
          published_at: now,
          updated_at: now
        ]
      )
      |> Repo.transaction()

    case result do
      {:ok, %{publish_latest_drafts: {count, _}}} when count > 0 ->
        maybe_log_admin_action(published_by_id, "publish_odds", "Match", match_id, %{
          version_no: latest_version,
          count: count,
          ip_address: audit_meta["ip_address"] || audit_meta[:ip_address],
          user_agent: audit_meta["user_agent"] || audit_meta[:user_agent]
        })

        {:ok, %{published_count: count, version_no: latest_version}}

      {:ok, _} ->
        {:error, :no_draft_odds_to_publish}

      err ->
        err
    end
  end

  def unpublish_match_odds(match_id, actor_id, audit_meta \\ %{}) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    case Repo.update_all(
           from(o in Odds,
             where:
               o.match_id == ^match_id and o.visibility_status == :published and
                 o.source_type == "platform"
           ),
           set: [visibility_status: :archived, updated_at: now]
         ) do
      {count, _} when count > 0 ->
        maybe_log_admin_action(actor_id, "unpublish_odds", "Match", match_id, %{
          count: count,
          ip_address: audit_meta["ip_address"] || audit_meta[:ip_address],
          user_agent: audit_meta["user_agent"] || audit_meta[:user_agent]
        })

        {:ok, %{unpublished_count: count}}

      _ ->
        {:error, :no_published_odds}
    end
  end

  def next_odds_version(match_id) do
    next_odds_version(match_id, "platform")
  end

  def next_odds_version(match_id, source_type) when is_binary(source_type) do
    (Repo.one(
       from o in Odds,
         where: o.match_id == ^match_id and o.source_type == ^source_type,
         select: max(o.version_no)
     ) || 0) + 1
  end

  # ── Bets ──────────────────────────────────────────────────────────────────────

  def list_user_bets(user_id, filters \\ []) do
    Bet
    |> where([b], b.user_id == ^user_id)
    |> apply_bet_filters(filters)
    |> order_by([b], desc: b.inserted_at)
    |> Repo.all()
  end

  def list_bets_by_match(match_id) do
    Repo.all(from b in Bet, where: b.match_id == ^match_id, preload: [:user, :odds])
  end

  def get_bet!(id), do: Repo.get!(Bet, id)

  @spec place_bet(
          Ecto.UUID.t(),
          Ecto.UUID.t(),
          Ecto.UUID.t(),
          Decimal.t() | integer() | float() | String.t()
        ) ::
          {:ok, map()} | {:error, atom()}
  def place_bet(user_id, match_id, odds_id, stake) do
    place_bet(user_id, match_id, odds_id, stake, %{})
  end

  @spec place_bet(
          Ecto.UUID.t(),
          Ecto.UUID.t(),
          Ecto.UUID.t(),
          Decimal.t() | integer() | float() | String.t(),
          execution_context()
        ) :: {:ok, map()} | {:error, atom()}
  def place_bet(user_id, match_id, odds_id, stake, execution_context)
      when is_map(execution_context) do
    place_bet_transaction(user_id, match_id, odds_id, stake, execution_context, false)
  end

  @doc "Places a bet during a live match. Requires match.in_play_enabled == true."
  @spec place_in_play_bet(
          Ecto.UUID.t(),
          Ecto.UUID.t(),
          Ecto.UUID.t(),
          Decimal.t() | integer() | float() | String.t()
        ) ::
          {:ok, map()} | {:error, atom()}
  def place_in_play_bet(user_id, match_id, odds_id, stake) do
    place_in_play_bet(user_id, match_id, odds_id, stake, %{})
  end

  @spec place_in_play_bet(
          Ecto.UUID.t(),
          Ecto.UUID.t(),
          Ecto.UUID.t(),
          Decimal.t() | integer() | float() | String.t(),
          execution_context()
        ) :: {:ok, map()} | {:error, atom()}
  def place_in_play_bet(user_id, match_id, odds_id, stake, execution_context)
      when is_map(execution_context) do
    place_bet_transaction(user_id, match_id, odds_id, stake, execution_context, true)
  end

  def cancel_bet(%Bet{} = bet) do
    Ecto.Multi.new()
    |> Ecto.Multi.run(:bet, fn repo, _changes ->
      lock_pending_bet(repo, bet.id)
    end)
    |> Ecto.Multi.run(:user, fn repo, %{bet: locked_bet} ->
      lock_user_for_wallet(repo, locked_bet.user_id)
    end)
    |> Ecto.Multi.update(:settled_bet, fn %{bet: locked_bet} ->
      Bet.settle_changeset(locked_bet, %{
        status: :cancelled,
        settled_at: DateTime.utc_now()
      })
    end)
    |> Ecto.Multi.run(:refund, fn repo, %{bet: locked_bet, user: user} ->
      user
      |> User.balance_changeset(%{balance: Decimal.add(user.balance, locked_bet.stake)})
      |> repo.update()
    end)
    |> Ecto.Multi.insert(:transaction, fn %{bet: locked_bet} ->
      Transaction.changeset(%Transaction{}, %{
        to_user_id: locked_bet.user_id,
        amount: locked_bet.stake,
        transaction_type: :credit,
        reference_id: locked_bet.id,
        description: "Bet cancelled - refund"
      })
    end)
    |> Repo.transaction()
    |> case do
      {:ok, %{settled_bet: settled_bet}} -> {:ok, settled_bet}
      {:error, _step, reason, _changes} -> {:error, reason}
    end
  end

  def cancel_bet(_bet), do: {:error, :bet_not_cancellable}

  # ── Settlement ────────────────────────────────────────────────────────────────

  defp settle_match_bets(%Match{id: match_id, winner: _winner} = match) do
    bets =
      Repo.all(
        from b in Bet,
          where: b.match_id == ^match_id and b.status == :pending,
          select: b.id
      )

    results =
      Enum.map(bets, fn bet_id ->
        settle_single_bet(match, bet_id)
      end)

    errors =
      Enum.filter(results, fn
        {:error, _} -> true
        _ -> false
      end)

    if Enum.empty?(errors), do: {:ok, length(results)}, else: {:error, errors}
  end

  defp settle_single_bet(match, bet_id) do
    outcome =
      Ecto.Multi.new()
      |> Ecto.Multi.run(:bet, fn repo, _changes ->
        case repo.one(
               from b in Bet,
                 where: b.id == ^bet_id and b.status == :pending,
                 preload: [:odds],
                 lock: "FOR UPDATE"
             ) do
          %Bet{} = bet -> {:ok, bet}
          _ -> {:error, :already_settled}
        end
      end)
      |> Ecto.Multi.run(:settlement, fn _repo, %{bet: bet} ->
        case evaluate_bet_settlement(match, bet.odds) do
          {:ok, won, result_value} -> {:ok, {won, result_value}}
          {:error, reason} -> {:error, reason}
        end
      end)
      |> Ecto.Multi.update(:settled_bet, fn %{bet: bet, settlement: {won, result_value}} ->
        status = if won, do: :won, else: :lost

        Bet.settle_changeset(bet, %{
          status: status,
          result: result_value,
          settled_at: DateTime.utc_now()
        })
      end)
      |> Ecto.Multi.run(:wallet_owner, fn repo, %{bet: bet, settlement: {won, _result_value}} ->
        if won do
          lock_user_for_wallet(repo, bet.user_id)
        else
          {:ok, nil}
        end
      end)
      |> Ecto.Multi.run(:credit, fn repo,
                                    %{
                                      bet: bet,
                                      wallet_owner: wallet_owner,
                                      settlement: {won, _result_value}
                                    } ->
        if won do
          wallet_owner
          |> User.balance_changeset(%{
            balance: Decimal.add(wallet_owner.balance, bet.potential_win)
          })
          |> repo.update()
        else
          {:ok, nil}
        end
      end)
      |> Ecto.Multi.insert(:transaction, fn %{bet: bet, settlement: {won, _result_value}} ->
        if won do
          Transaction.changeset(%Transaction{}, %{
            to_user_id: bet.user_id,
            amount: bet.potential_win,
            transaction_type: :bet_won,
            reference_id: bet.id,
            description: "Bet won"
          })
        else
          Transaction.changeset(%Transaction{}, %{
            to_user_id: bet.user_id,
            amount: bet.stake,
            transaction_type: :bet_lost,
            reference_id: bet.id,
            description: "Bet lost"
          })
        end
      end)
      |> Repo.transaction()

    case outcome do
      {:ok, %{bet: bet, settlement: {true, _result_value}, credit: %User{} = updated_user}} ->
        BackWeb.UserChannel.push_balance_update(bet.user_id, updated_user.balance)
        BackWeb.UserChannel.push_bet_settled(bet.user_id, bet.id, :won)
        {:ok, :settled}

      {:ok, %{bet: bet, settlement: {false, _result_value}}} ->
        BackWeb.UserChannel.push_bet_settled(bet.user_id, bet.id, :lost)
        {:ok, :settled}

      {:error, :bet, :already_settled, _changes} ->
        {:ok, :already_settled}

      {:error, _step, reason, _changes} ->
        {:error, reason}
    end
  end

  # ── Commission ────────────────────────────────────────────────────────────────

  def calculate_and_pay_commission(_match_id), do: :ok

  # ── Private Helpers ───────────────────────────────────────────────────────────

  defp ensure_market_enabled(%Match{sport: sport}, %Odds{bet_type: bet_type}) do
    case Repo.get_by(SportMarketConfig, sport: sport, bet_type: bet_type) do
      %SportMarketConfig{is_enabled: false} -> {:error, :market_not_enabled}
      _ -> {:ok, :market_enabled}
    end
  end

  # Deadlock prevention strategy:
  # every concurrent bet process acquires rows in the exact same order:
  # 1) user wallet row
  # 2) match row
  # 3) odds row
  # Because no code in this path locks them in a different order, requests queue
  # rather than forming cyclical wait graphs.
  defp place_bet_transaction(
         user_id,
         match_id,
         odds_id,
         stake_input,
         execution_context,
         is_in_play
       ) do
    stake = Decimal.new(to_string(stake_input))
    execution_context = normalize_execution_context(execution_context)

    result =
      Ecto.Multi.new()
      |> Ecto.Multi.run(:user, fn repo, _changes -> lock_active_user(repo, user_id) end)
      |> Ecto.Multi.run(:match, fn repo, _changes -> lock_match(repo, match_id, is_in_play) end)
      |> Ecto.Multi.run(:odds, fn repo, %{match: match} ->
        lock_published_platform_odds(repo, odds_id, match.id, execution_context, is_in_play)
      end)
      |> Ecto.Multi.run(:market_supported, fn _repo, %{match: match, odds: odds} ->
        ensure_market_settlement_supported(match, odds)
      end)
      |> Ecto.Multi.run(:market_enabled, fn _repo, %{match: match, odds: odds} ->
        ensure_market_enabled(match, odds)
      end)
      |> Ecto.Multi.run(:market_state, fn _repo, %{match: match, odds: odds} ->
        ensure_market_not_suspended(
          match,
          execution_context.market_key || default_market_key(odds)
        )
      end)
      |> Ecto.Multi.run(:quote_freshness, fn _repo, %{match: match, odds: odds} ->
        ensure_quote_fresh(match, odds, execution_context, is_in_play)
      end)
      |> Ecto.Multi.run(:betting_limits, fn _repo, %{user: user, odds: odds} ->
        ensure_betting_allowed(user, stake, odds)
      end)
      |> Ecto.Multi.run(:balance_check, fn _repo, %{user: user} ->
        if Decimal.compare(user.balance, stake) != :lt,
          do: {:ok, :sufficient},
          else: {:error, :insufficient_balance}
      end)
      |> Ecto.Multi.run(:deduct_balance, fn repo, %{user: user} ->
        now = DateTime.utc_now() |> DateTime.truncate(:second)

        user
        |> User.balance_changeset(%{
          balance: Decimal.sub(user.balance, stake),
          wallet_version: user.wallet_version + 1,
          last_balance_changed_at: now
        })
        |> repo.update()
      end)
      |> Ecto.Multi.insert(:bet, fn %{user: user, match: match, odds: odds} ->
        potential_win = Decimal.mult(stake, odds.odds_value)

        Bet.changeset(%Bet{}, %{
          user_id: user.id,
          match_id: match.id,
          odds_id: odds.id,
          stake: stake,
          potential_win: potential_win,
          is_in_play: is_in_play,
          match_state_version: execution_context.match_state_version || match.live_state_version,
          odds_version_no: execution_context.odds_version_no || odds.version_no,
          market_key: execution_context.market_key || default_market_key(odds),
          selection_key: execution_context.selection_key || default_selection_key(odds),
          quoted_odds_value: execution_context.quoted_odds_value || odds.odds_value,
          accepted_at: DateTime.utc_now() |> DateTime.truncate(:second),
          client_snapshot: execution_context.client_snapshot || %{}
        })
      end)
      |> Ecto.Multi.insert(:transaction, fn %{user: user, match: match, bet: bet} ->
        Transaction.changeset(%Transaction{}, %{
          from_user_id: user.id,
          to_user_id: user.id,
          amount: stake,
          transaction_type: :bet_placed,
          reference_id: bet.id,
          description: "Bet placed on match #{match.id}"
        })
      end)
      |> Repo.transaction()

    case result do
      {:ok, %{bet: bet, deduct_balance: updated_user, match: match}} = ok ->
        BackWeb.UserChannel.push_balance_update(user_id, updated_user.balance)
        BackWeb.MatchChannel.broadcast_bet_placed(match.id, bet.id)
        ok

      {:error, _step, reason, _changes} ->
        maybe_log_bet_rejection(user_id, match_id, odds_id, stake, reason)
        {:error, reason}

      other ->
        other
    end
  end

  defp lock_active_user(repo, user_id) do
    case repo.one(from u in User, where: u.id == ^user_id, lock: "FOR UPDATE") do
      %User{is_active: true} = user -> {:ok, user}
      nil -> {:error, :user_not_found}
      _ -> {:error, :user_inactive}
    end
  end

  defp lock_user_for_wallet(repo, user_id) do
    case repo.one(from u in User, where: u.id == ^user_id, lock: "FOR UPDATE") do
      %User{} = user -> {:ok, user}
      nil -> {:error, :user_not_found}
    end
  end

  defp lock_pending_bet(repo, bet_id) do
    case repo.one(
           from b in Bet, where: b.id == ^bet_id and b.status == :pending, lock: "FOR UPDATE"
         ) do
      %Bet{} = bet -> {:ok, bet}
      _ -> {:error, :bet_not_cancellable}
    end
  end

  defp lock_match(repo, match_id, true) do
    case repo.one(from m in Match, where: m.id == ^match_id, lock: "FOR UPDATE") do
      %Match{status: :live, in_play_enabled: true} = match -> {:ok, match}
      %Match{status: :live, in_play_enabled: false} -> {:error, :in_play_not_enabled}
      nil -> {:error, :match_not_found}
      _ -> {:error, :match_not_live}
    end
  end

  defp lock_match(repo, match_id, false) do
    case repo.one(from m in Match, where: m.id == ^match_id, lock: "FOR UPDATE") do
      %Match{status: status} = match when status in [:upcoming, :live] -> {:ok, match}
      nil -> {:error, :match_not_found}
      _ -> {:error, :match_not_open}
    end
  end

  defp lock_published_platform_odds(repo, odds_id, match_id, execution_context, is_in_play) do
    case repo.one(
           from o in Odds,
             where:
               o.id == ^odds_id and o.match_id == ^match_id and o.is_active == true and
                 o.visibility_status == :published and o.source_type == "platform",
             lock: "FOR UPDATE"
         ) do
      %Odds{} = odds -> {:ok, odds}
      _ -> maybe_lock_replacement_platform_odds(repo, match_id, execution_context, is_in_play)
    end
  end

  defp maybe_lock_replacement_platform_odds(_repo, _match_id, _execution_context, false),
    do: {:error, :odds_not_available}

  defp maybe_lock_replacement_platform_odds(repo, match_id, execution_context, true) do
    market_key = execution_context.market_key
    selection_key = execution_context.selection_key

    if is_binary(market_key) and market_key != "" and is_binary(selection_key) and
         selection_key != "" do
      candidates =
        repo.all(
          from o in Odds,
            where:
              o.match_id == ^match_id and o.is_active == true and
                o.visibility_status == :published and o.source_type == "platform" and
                (o.source_market_key == ^market_key or
                   fragment("?::text", o.bet_type) == ^market_key),
            order_by: [desc: o.version_no, desc: o.updated_at],
            limit: 32,
            lock: "FOR UPDATE"
        )

      case Enum.find(candidates, &selection_matches?(&1, selection_key)) do
        %Odds{} = odds -> {:ok, odds}
        nil -> {:error, :odds_not_available}
      end
    else
      {:error, :odds_not_available}
    end
  end

  defp ensure_market_not_suspended(
         %Match{market_state: market_state, suspended_markets: suspended_markets},
         market_key
       )
       when is_map(market_state) do
    cond do
      market_state["suspended"] == true or market_state[:suspended] == true ->
        {:error, :market_suspended}

      market_key_suspended?(suspended_markets, market_key) ->
        {:error, :market_suspended}

      market_key_suspended?(
        market_state["suspended_markets"] || market_state[:suspended_markets],
        market_key
      ) ->
        {:error, :market_suspended}

      true ->
        {:ok, :market_active}
    end
  end

  defp ensure_market_not_suspended(%Match{suspended_at: %DateTime{}}, _market_key),
    do: {:error, :market_suspended}

  defp ensure_market_not_suspended(%Match{suspended_markets: suspended_markets}, market_key) do
    if market_key_suspended?(suspended_markets, market_key) do
      {:error, :market_suspended}
    else
      {:ok, :market_active}
    end
  end

  defp ensure_market_not_suspended(_match, _market_key), do: {:ok, :market_active}

  defp market_key_suspended?(suspended_markets, market_key)
       when is_map(suspended_markets) and is_binary(market_key) do
    Map.has_key?(suspended_markets, market_key)
  end

  defp market_key_suspended?(_, _), do: false

  defp ensure_quote_fresh(%Match{} = match, %Odds{} = odds, execution_context, is_in_play) do
    with :ok <-
           ensure_match_state_version(match, execution_context.match_state_version, is_in_play),
         :ok <- ensure_odds_version(odds, execution_context.odds_version_no, is_in_play),
         :ok <- ensure_quoted_price(odds, execution_context.quoted_odds_value, is_in_play),
         :ok <- ensure_odds_not_expired(odds, is_in_play) do
      {:ok, :quote_fresh}
    end
  end

  defp ensure_match_state_version(%Match{}, nil, true), do: {:error, :stale_quote}
  defp ensure_match_state_version(%Match{}, nil, false), do: :ok

  defp ensure_match_state_version(%Match{live_state_version: current}, incoming, true) do
    if is_integer(incoming) and is_integer(current) and incoming <= current,
      do: :ok,
      else: {:error, :stale_quote}
  end

  defp ensure_match_state_version(%Match{live_state_version: current}, incoming, _is_in_play) do
    if incoming == current, do: :ok, else: {:error, :stale_quote}
  end

  defp ensure_odds_version(%Odds{}, nil, true), do: {:error, :stale_quote}
  defp ensure_odds_version(%Odds{}, nil, false), do: :ok

  defp ensure_odds_version(%Odds{version_no: current}, incoming, true) do
    if is_integer(incoming) and is_integer(current) and incoming <= current,
      do: :ok,
      else: {:error, :stale_quote}
  end

  defp ensure_odds_version(%Odds{version_no: current}, incoming, _is_in_play) do
    if incoming == current, do: :ok, else: {:error, :stale_quote}
  end

  defp ensure_quoted_price(%Odds{}, nil, true), do: {:error, :stale_quote}
  defp ensure_quoted_price(%Odds{}, nil, false), do: :ok

  defp ensure_quoted_price(%Odds{odds_value: current}, incoming, true) do
    if quoted_price_within_live_tolerance?(incoming, current),
      do: :ok,
      else: {:error, :stale_quote}
  end

  defp ensure_quoted_price(%Odds{odds_value: current}, incoming, _is_in_play) do
    if Decimal.equal?(incoming, current), do: :ok, else: {:error, :stale_quote}
  end

  defp quoted_price_within_live_tolerance?(%Decimal{} = quoted, %Decimal{} = current) do
    minimum_acceptable = Decimal.mult(quoted, Decimal.new("0.98"))
    Decimal.compare(current, minimum_acceptable) != :lt
  end

  defp quoted_price_within_live_tolerance?(_, _), do: false

  defp ensure_odds_not_expired(%Odds{}, false), do: :ok

  defp ensure_odds_not_expired(%Odds{} = odds, true) do
    valid_for_ms =
      case odds.provider_snapshot do
        %{"valid_for_ms" => value} -> normalize_valid_for_ms(value)
        %{valid_for_ms: value} -> normalize_valid_for_ms(value)
        _ -> nil
      end

    if is_integer(valid_for_ms) and valid_for_ms > 0 do
      reference_time = odds.published_at || odds.updated_at || odds.inserted_at

      if is_nil(reference_time) do
        {:error, :odds_not_available}
      else
        age_ms = DateTime.diff(DateTime.utc_now(), reference_time, :millisecond)
        if age_ms <= valid_for_ms, do: :ok, else: {:error, :odds_not_available}
      end
    else
      :ok
    end
  end

  defp normalize_execution_context(context) when is_map(context) do
    %{
      match_state_version:
        normalize_non_negative_integer(
          context[:match_state_version] || context["match_state_version"]
        ),
      odds_version_no:
        normalize_non_negative_integer(context[:odds_version_no] || context["odds_version_no"]),
      market_key: normalize_optional_string(context[:market_key] || context["market_key"]),
      selection_key:
        normalize_optional_string(context[:selection_key] || context["selection_key"]),
      quoted_odds_value:
        normalize_decimal(context[:quoted_odds_value] || context["quoted_odds_value"]),
      client_snapshot: normalize_snapshot(context[:client_snapshot] || context["client_snapshot"])
    }
  end

  defp normalize_execution_context(_), do: %{client_snapshot: %{}}

  defp normalize_non_negative_integer(nil), do: nil
  defp normalize_non_negative_integer(value) when is_integer(value) and value >= 0, do: value

  defp normalize_non_negative_integer(value) when is_binary(value) do
    case Integer.parse(String.trim(value)) do
      {parsed, ""} when parsed >= 0 -> parsed
      _ -> nil
    end
  end

  defp normalize_non_negative_integer(_), do: nil

  defp normalize_decimal(nil), do: nil
  defp normalize_decimal(%Decimal{} = value), do: value
  defp normalize_decimal(value) when is_integer(value), do: Decimal.new(value)
  defp normalize_decimal(value) when is_float(value), do: Decimal.from_float(value)

  defp normalize_decimal(value) when is_binary(value) do
    case Decimal.parse(String.trim(value)) do
      {decimal, ""} -> decimal
      _ -> nil
    end
  end

  defp normalize_decimal(_), do: nil

  defp normalize_integer(nil), do: nil
  defp normalize_integer(value) when is_integer(value), do: value
  defp normalize_integer(value) when is_float(value), do: trunc(value)

  defp normalize_integer(value) when is_binary(value) do
    case Integer.parse(String.trim(value)) do
      {parsed, _} -> parsed
      _ -> nil
    end
  end

  defp normalize_integer(_), do: nil

  defp normalize_optional_string(nil), do: nil

  defp normalize_optional_string(value) do
    value
    |> to_string()
    |> String.trim()
    |> case do
      "" -> nil
      normalized -> normalized
    end
  end

  defp normalize_snapshot(%Decimal{} = value), do: Decimal.to_string(value, :normal)
  defp normalize_snapshot(%DateTime{} = value), do: DateTime.to_iso8601(value)
  defp normalize_snapshot(%NaiveDateTime{} = value), do: NaiveDateTime.to_iso8601(value)
  defp normalize_snapshot(%Date{} = value), do: Date.to_iso8601(value)
  defp normalize_snapshot(%Time{} = value), do: Time.to_iso8601(value)

  defp normalize_snapshot(%_{} = value) do
    value
    |> Map.from_struct()
    |> normalize_snapshot()
  end

  defp normalize_snapshot(value) when is_map(value) do
    Map.new(value, fn {key, nested_value} ->
      {key, normalize_snapshot(nested_value)}
    end)
  end

  defp normalize_snapshot(value) when is_list(value), do: Enum.map(value, &normalize_snapshot/1)

  defp normalize_snapshot(value) when is_integer(value) or is_float(value) or is_boolean(value),
    do: value

  defp normalize_snapshot(value) when is_binary(value), do: value
  defp normalize_snapshot(nil), do: nil
  defp normalize_snapshot(value) when is_atom(value), do: Atom.to_string(value)
  defp normalize_snapshot(_), do: %{}

  defp normalize_map_snapshot(value) when is_map(value) do
    value
    |> normalize_snapshot()
    |> ensure_json_safe_map()
  end

  defp normalize_map_snapshot(nil), do: %{}

  defp normalize_map_snapshot(value) when is_binary(value) do
    case value |> String.trim() |> String.downcase() do
      "" -> %{}
      "nil" -> %{}
      "null" -> %{}
      _ -> %{}
    end
  end

  defp normalize_map_snapshot(_), do: %{}

  defp ensure_json_safe_map(value) when is_map(value) do
    value
    |> Jason.encode!()
    |> Jason.decode!()
  rescue
    _ -> %{}
  end

  defp default_market_key(%Odds{bet_type: bet_type}) when is_atom(bet_type),
    do: Atom.to_string(bet_type)

  defp default_market_key(%Odds{bet_type: bet_type}) when is_binary(bet_type), do: bet_type
  defp default_market_key(_), do: nil

  defp default_selection_key(%Odds{outcome: outcome}) when is_binary(outcome) do
    outcome
    |> String.downcase()
    |> String.trim()
    |> String.replace(~r/\s+/, "_")
  end

  defp default_selection_key(_), do: nil

  defp selection_matches?(%Odds{} = odds, incoming_selection_key)
       when is_binary(incoming_selection_key) do
    requested = selection_aliases(incoming_selection_key)

    odds
    |> odds_selection_tokens()
    |> Enum.any?(&MapSet.member?(requested, &1))
  end

  defp selection_matches?(_, _), do: false

  defp odds_selection_tokens(%Odds{} = odds) do
    snapshot_selection_key =
      case odds.provider_snapshot do
        %{"selection_key" => value} -> value
        %{selection_key: value} -> value
        _ -> nil
      end

    raw_tokens = [
      odds.outcome,
      default_selection_key(odds),
      snapshot_selection_key
    ]

    raw_tokens
    |> Enum.flat_map(&MapSet.to_list(selection_aliases(&1)))
    |> MapSet.new()
  end

  defp selection_aliases(value) do
    case normalize_selection_token(value) do
      nil ->
        MapSet.new()

      "home" ->
        MapSet.new(["home", "team1", "1"])

      "team1" ->
        MapSet.new(["home", "team1", "1"])

      "1" ->
        MapSet.new(["home", "team1", "1"])

      "away" ->
        MapSet.new(["away", "team2", "2"])

      "team2" ->
        MapSet.new(["away", "team2", "2"])

      "2" ->
        MapSet.new(["away", "team2", "2"])

      "draw" ->
        MapSet.new(["draw", "x", "tie"])

      "x" ->
        MapSet.new(["draw", "x", "tie"])

      "tie" ->
        MapSet.new(["draw", "x", "tie"])

      "yes" ->
        MapSet.new(["yes", "y"])

      "y" ->
        MapSet.new(["yes", "y"])

      "no" ->
        MapSet.new(["no", "n"])

      "n" ->
        MapSet.new(["no", "n"])

      normalized ->
        MapSet.new([normalized])
    end
  end

  defp normalize_selection_token(value) when is_binary(value) do
    value
    |> String.downcase()
    |> String.trim()
    |> String.replace(~r/[^\p{L}\p{N}\s]/u, " ")
    |> String.replace(~r/\s+/, "_")
    |> case do
      "" -> nil
      token -> token
    end
  end

  defp normalize_selection_token(value) when is_atom(value) do
    value
    |> Atom.to_string()
    |> normalize_selection_token()
  end

  defp normalize_selection_token(value) when is_integer(value), do: Integer.to_string(value)
  defp normalize_selection_token(_), do: nil

  defp apply_match_filters(query, filters) do
    Enum.reduce(filters, query, fn
      {:sport, sport}, q ->
        where(q, [m], m.sport == ^sport)

      {:status, status}, q ->
        where(q, [m], m.status == ^status)

      {:competition_feed_id, competition_feed_id}, q ->
        where(q, [m], m.competition_feed_id == ^competition_feed_id)

      {:competition_key, competition_key}, q ->
        where(
          q,
          [m],
          fragment("?->'_competition_feed'->>'competition_key' = ?", m.raw_data, ^competition_key)
        )

      {:date_from, %DateTime{} = date_from}, q ->
        where(q, [m], m.start_time >= ^date_from)

      {:date_to, %DateTime{} = date_to}, q ->
        where(q, [m], m.start_time < ^date_to)

      {:live_only, true}, q ->
        where(q, [m], m.status == :live)

      {:has_public_odds, true}, q ->
        where(
          q,
          [m],
          fragment(
            "exists (select 1 from odds o where o.match_id = ? and o.visibility_status = 'published' and o.source_type = 'platform' and o.is_active = true)",
            m.id
          )
        )

      _, q ->
        q
    end)
  end

  defp apply_match_limit(query, filters) do
    case Keyword.get(filters, :limit) do
      limit when is_integer(limit) and limit > 0 -> limit(query, ^limit)
      _ -> query
    end
  end

  defp apply_match_offset(query, filters) do
    case Keyword.get(filters, :offset) do
      offset when is_integer(offset) and offset >= 0 -> offset(query, ^offset)
      _ -> query
    end
  end

  defp apply_odds_filters(query, filters) do
    Enum.reduce(filters, query, fn
      {:bet_type, type}, q -> where(q, [o], o.bet_type == ^type)
      {:active_only, true}, q -> where(q, [o], o.is_active == true)
      {:visibility_status, status}, q -> where(q, [o], o.visibility_status == ^status)
      {:source_type, source_type}, q -> where(q, [o], o.source_type == ^source_type)
      _, q -> q
    end)
  end

  defp apply_bet_filters(query, filters) do
    Enum.reduce(filters, query, fn
      {:status, status}, q -> where(q, [b], b.status == ^status)
      {:in_play, val}, q -> where(q, [b], b.is_in_play == ^val)
      _, q -> q
    end)
  end

  defp apply_sport_market_config_filters(query, filters) do
    Enum.reduce(filters, query, fn
      {:sport, sport}, q -> where(q, [c], c.sport == ^sport)
      {:bet_type, bet_type}, q -> where(q, [c], c.bet_type == ^bet_type)
      {:enabled_only, true}, q -> where(q, [c], c.is_enabled == true)
      _, q -> q
    end)
  end

  defp normalize_external_match_attrs(attrs) do
    sport = attrs[:sport] || attrs["sport"] || "cricket"
    status = attrs[:status] || attrs["status"] || "upcoming"
    normalized_status = normalize_status(status)

    raw_data =
      attrs[:raw] || attrs["raw"] || attrs[:raw_data] || attrs["raw_data"] ||
        %{}
        |> normalize_map_snapshot()

    score =
      attrs[:score] || attrs["score"] ||
        %{}
        |> normalize_map_snapshot()

    live_timestamp = normalize_live_timestamp(normalized_status, raw_data, score)

    %{
      external_id: attrs[:external_id] || attrs["external_id"],
      provider: attrs[:provider] || attrs["provider"],
      sport: normalize_sport(sport),
      team1: attrs[:team1] || attrs["team1"] || "Team 1",
      team2: attrs[:team2] || attrs["team2"] || "Team 2",
      start_time: normalize_datetime(attrs[:start_time] || attrs["start_time"]),
      status: normalized_status,
      slug: attrs[:slug] || attrs["slug"] || build_match_slug(attrs),
      competition_feed_id:
        attrs[:competition_feed_id] || attrs["competition_feed_id"] ||
          get_in(raw_data, [
            "_competition_feed",
            "id"
          ]),
      score: score,
      raw_data: raw_data,
      in_play_enabled: normalized_status == :live,
      last_live_event_at: live_timestamp,
      live_state_version:
        normalize_integer(attrs[:live_state_version] || attrs["live_state_version"]) || 0,
      current_innings:
        normalize_integer(attrs[:current_innings] || attrs["current_innings"]) || 0,
      current_over: normalize_decimal(attrs[:current_over] || attrs["current_over"]),
      current_ball_in_over:
        normalize_integer(attrs[:current_ball_in_over] || attrs["current_ball_in_over"]) || 0,
      batting_team: normalize_optional_string(attrs[:batting_team] || attrs["batting_team"]),
      bowling_team: normalize_optional_string(attrs[:bowling_team] || attrs["bowling_team"]),
      runs_total: normalize_integer(attrs[:runs_total] || attrs["runs_total"]) || 0,
      wickets_total: normalize_integer(attrs[:wickets_total] || attrs["wickets_total"]) || 0,
      target_runs: normalize_integer(attrs[:target_runs] || attrs["target_runs"]),
      required_run_rate:
        normalize_decimal(attrs[:required_run_rate] || attrs["required_run_rate"]),
      current_run_rate: normalize_decimal(attrs[:current_run_rate] || attrs["current_run_rate"]),
      elapsed_minute: normalize_integer(attrs[:elapsed_minute] || attrs["elapsed_minute"]) || 0,
      stoppage_minute:
        normalize_integer(attrs[:stoppage_minute] || attrs["stoppage_minute"]) || 0,
      home_score: normalize_integer(attrs[:home_score] || attrs["home_score"]) || 0,
      away_score: normalize_integer(attrs[:away_score] || attrs["away_score"]) || 0,
      home_red_cards: normalize_integer(attrs[:home_red_cards] || attrs["home_red_cards"]) || 0,
      away_red_cards: normalize_integer(attrs[:away_red_cards] || attrs["away_red_cards"]) || 0,
      home_corners: normalize_integer(attrs[:home_corners] || attrs["home_corners"]) || 0,
      away_corners: normalize_integer(attrs[:away_corners] || attrs["away_corners"]) || 0,
      home_shots_on_target:
        normalize_integer(attrs[:home_shots_on_target] || attrs["home_shots_on_target"]) || 0,
      away_shots_on_target:
        normalize_integer(attrs[:away_shots_on_target] || attrs["away_shots_on_target"]) || 0,
      tempo_index: normalize_decimal(attrs[:tempo_index] || attrs["tempo_index"]),
      market_state: normalize_map_snapshot(attrs[:market_state] || attrs["market_state"]),
      last_ball_event_type:
        normalize_optional_string(attrs[:last_ball_event_type] || attrs["last_ball_event_type"])
    }
  end

  defp sanitize_external_match_json_attrs(attrs) when is_map(attrs) do
    attrs
    |> Map.update(:score, %{}, &normalize_map_snapshot/1)
    |> Map.update(:raw_data, %{}, &normalize_map_snapshot/1)
    |> Map.update(:market_state, %{}, &normalize_map_snapshot/1)
    |> Map.update(:suspended_markets, %{}, &normalize_map_snapshot/1)
  end

  defp normalize_sport(sport) when sport in [:cricket, "cricket"], do: :cricket
  defp normalize_sport(sport) when sport in [:tennis, "tennis"], do: :tennis
  defp normalize_sport(sport) when sport in [:football, "football", "soccer"], do: :football

  defp normalize_sport(sport)
       when sport in [:horse_racing, "horse_racing", "horse-racing", "horse racing"],
       do: :horse_racing

  defp normalize_sport(sport)
       when sport in [:dog_racing, "dog_racing", "dog-racing", "dog racing"], do: :dog_racing

  defp normalize_sport(_), do: :cricket

  defp normalize_status(status) do
    status
    |> normalize_status_key()
    |> case do
      key
      when key in ["upcoming", "scheduled", "not started", "not_started", "ns", "pst", "tbd"] ->
        :upcoming

      key
      when key in [
             "live",
             "in progress",
             "in_progress",
             "1h",
             "ht",
             "2h",
             "et",
             "p",
             "bt",
             "1st innings",
             "2nd innings",
             "innings break",
             "innings_break",
             "tea break",
             "lunch",
             "drinks",
             "super over",
             "super_over",
             "stumps"
           ] ->
        :live

      key
      when key in [
             "completed",
             "finished",
             "closed",
             "result",
             "match end",
             "match ended",
             "ft",
             "aet",
             "pen"
           ] ->
        :closed

      key when key in ["settled"] ->
        :settled

      key
      when key in ["cancelled", "canc", "abandoned", "abd", "awd", "wo", "no result", "no_result"] ->
        :cancelled

      _ ->
        :upcoming
    end
  end

  defp normalize_status_key(status) when is_atom(status),
    do: status |> Atom.to_string() |> normalize_status_key()

  defp normalize_status_key(status) when is_integer(status), do: Integer.to_string(status)

  defp normalize_status_key(status) when is_binary(status) do
    status
    |> String.downcase()
    |> String.trim()
    |> String.replace(~r/[\s_-]+/, " ")
  end

  defp normalize_status_key(_), do: ""

  defp normalize_datetime(%DateTime{} = dt), do: dt
  defp normalize_datetime(%NaiveDateTime{} = dt), do: DateTime.from_naive!(dt, "Etc/UTC")

  defp normalize_datetime(value) when is_binary(value) do
    case DateTime.from_iso8601(value) do
      {:ok, dt, _} ->
        dt

      _ ->
        case NaiveDateTime.from_iso8601(value) do
          {:ok, ndt} -> DateTime.from_naive!(ndt, "Etc/UTC")
          _ -> DateTime.utc_now() |> DateTime.truncate(:second)
        end
    end
  end

  defp normalize_datetime(_), do: DateTime.utc_now() |> DateTime.truncate(:second)

  defp normalize_live_timestamp(:live, raw_data, score) do
    _ = raw_data
    _ = score
    DateTime.utc_now() |> DateTime.truncate(:second)
  end

  defp normalize_live_timestamp(_, _raw_data, _score), do: nil

  defp build_match_slug(attrs) do
    [
      attrs[:sport] || attrs["sport"],
      attrs[:team1] || attrs["team1"],
      "vs",
      attrs[:team2] || attrs["team2"],
      attrs[:start_time] || attrs["start_time"]
    ]
    |> Enum.reject(&is_nil/1)
    |> Enum.map(fn
      %DateTime{} = dt -> Calendar.strftime(dt, "%Y-%m-%d")
      value -> to_string(value)
    end)
    |> Enum.join(" ")
    |> MatchSlug.slugify()
  end

  defp ensure_betting_allowed(%User{betting_locked: true}, _stake, _odds),
    do: {:error, :betting_locked}

  defp ensure_betting_allowed(%User{} = user, stake, %Odds{} = odds) do
    # Layered order:
    # 1) user-level lock/max stake
    # 2) odds-level max stake
    # 3) odds-level max payout
    # 4) user daily exposure
    with :ok <- enforce_max_stake(user, stake),
         :ok <- enforce_odds_max_stake(odds, stake),
         :ok <- enforce_odds_max_payout(odds, stake),
         :ok <- enforce_daily_exposure(user, stake) do
      {:ok, :betting_limits_passed}
    end
  end

  defp enforce_max_stake(%User{max_stake_per_bet: nil}, _stake), do: :ok

  defp enforce_max_stake(%User{max_stake_per_bet: max_stake}, stake) do
    if Decimal.compare(stake, max_stake) in [:lt, :eq],
      do: :ok,
      else: {:error, :stake_limit_exceeded}
  end

  defp enforce_odds_max_stake(%Odds{max_stake_amount: nil}, _stake), do: :ok

  defp enforce_odds_max_stake(%Odds{max_stake_amount: max_stake}, stake) do
    if Decimal.compare(stake, max_stake) in [:lt, :eq],
      do: :ok,
      else: {:error, :odds_stake_limit_exceeded}
  end

  defp enforce_odds_max_payout(%Odds{max_payout_amount: nil}, _stake), do: :ok

  defp enforce_odds_max_payout(
         %Odds{max_payout_amount: max_payout, odds_value: odds_value},
         stake
       ) do
    payout = Decimal.mult(stake, odds_value)

    if Decimal.compare(payout, max_payout) in [:lt, :eq],
      do: :ok,
      else: {:error, :payout_limit_exceeded}
  end

  defp enforce_daily_exposure(%User{daily_max_exposure: nil}, _stake), do: :ok

  defp enforce_daily_exposure(%User{id: user_id, daily_max_exposure: max_exposure}, stake) do
    today_start =
      Date.utc_today()
      |> NaiveDateTime.new!(~T[00:00:00])
      |> DateTime.from_naive!("Etc/UTC")

    today_stake =
      Repo.one(
        from b in Bet,
          where: b.user_id == ^user_id and b.inserted_at >= ^today_start,
          select: coalesce(sum(b.stake), ^Decimal.new(0))
      )

    if Decimal.compare(Decimal.add(today_stake, stake), max_exposure) in [:lt, :eq],
      do: :ok,
      else: {:error, :daily_exposure_exceeded}
  end

  defp maybe_only_published(query, true), do: query

  defp maybe_only_published(query, false),
    do:
      where(
        query,
        [o],
        o.visibility_status == :published and o.source_type == "platform"
      )

  defp maybe_only_bettable(query, true), do: query

  defp maybe_only_bettable(query, false) do
    where(
      query,
      [o],
      o.bet_type in ^bettable_bet_types() or
        o.bet_type == :in_play
    )
  end

  defp filter_expired_published_odds(odds_rows) when is_list(odds_rows) do
    degraded_guard_match_ids = degraded_expiry_guard_match_ids(odds_rows)

    {expired, active} =
      Enum.split_with(odds_rows, fn row ->
        expired_published_odds?(row) and
          not MapSet.member?(degraded_guard_match_ids, row.match_id)
      end)

    maybe_archive_expired_published_odds(expired)
    active
  end

  defp expired_published_odds?(%Odds{} = odds) do
    valid_for_ms =
      case odds.provider_snapshot do
        %{"valid_for_ms" => value} -> normalize_valid_for_ms(value)
        %{valid_for_ms: value} -> normalize_valid_for_ms(value)
        _ -> nil
      end

    reference_time = odds.updated_at || odds.published_at || odds.inserted_at

    cond do
      odds.visibility_status != :published ->
        false

      odds.is_active != true ->
        false

      odds.source_provider == "api_tennis" ->
        false

      is_nil(valid_for_ms) or valid_for_ms <= 0 ->
        false

      is_nil(reference_time) ->
        false

      true ->
        age_ms = DateTime.diff(DateTime.utc_now(), reference_time, :millisecond)
        age_ms >= valid_for_ms
    end
  end

  defp normalize_valid_for_ms(value) when is_integer(value) and value > 0, do: value

  defp normalize_valid_for_ms(value) when is_binary(value) do
    case Integer.parse(value) do
      {parsed, ""} when parsed > 0 -> parsed
      _ -> nil
    end
  end

  defp normalize_valid_for_ms(_), do: nil

  defp maybe_archive_expired_published_odds([]), do: :ok

  defp maybe_archive_expired_published_odds(expired_rows) when is_list(expired_rows) do
    ids =
      expired_rows
      |> Enum.map(& &1.id)
      |> Enum.reject(&is_nil/1)

    if ids != [] do
      now = DateTime.utc_now() |> DateTime.truncate(:second)

      _ =
        Repo.update_all(
          from(o in Odds,
            where: o.id in ^ids and o.visibility_status == :published and o.is_active == true
          ),
          set: [is_active: false, visibility_status: :archived, updated_at: now]
        )
    end

    :ok
  end

  defp degraded_expiry_guard_match_ids(odds_rows) when is_list(odds_rows) do
    match_ids =
      odds_rows
      |> Enum.map(& &1.match_id)
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()

    if match_ids == [] do
      MapSet.new()
    else
      grace_ms =
        Application.get_env(:back, :degraded_quote_expiry_grace_ms, 120_000)

      Repo.all(
        from m in Match,
          where: m.id in ^match_ids,
          select: {m.id, m.market_state, m.status}
      )
      |> Enum.reduce(MapSet.new(), fn {match_id, market_state, status}, acc ->
        if degraded_expiry_guard?(market_state, status, grace_ms) do
          MapSet.put(acc, match_id)
        else
          acc
        end
      end)
    end
  end

  defp degraded_expiry_guard?(%{} = market_state, status, grace_ms)
       when is_integer(grace_ms) and grace_ms > 0 do
    degraded? = market_state["degraded"] == true or market_state[:degraded] == true
    last_degraded_at = market_state["last_degraded_at"] || market_state[:last_degraded_at]
    still_open_status? = status in [:live, :upcoming]

    cond do
      not degraded? ->
        false

      still_open_status? ->
        true

      is_binary(last_degraded_at) ->
        case DateTime.from_iso8601(last_degraded_at) do
          {:ok, ts, _offset} ->
            DateTime.diff(DateTime.utc_now(), ts, :millisecond) <= grace_ms

          _ ->
            true
        end

      true ->
        true
    end
  end

  defp degraded_expiry_guard?(_, _, _), do: false

  defp ensure_match_accepting_odds(%Match{status: status})
       when status in [:closed, :settled, :cancelled],
       do: {:error, :match_not_accepting_odds}

  defp ensure_match_accepting_odds(%Match{}), do: :ok

  defp ensure_market_settlement_supported(%Match{} = match, %Odds{bet_type: bet_type} = odds) do
    cond do
      bet_type in bettable_bet_types() ->
        {:ok, :market_settlement_supported}

      bet_type == :in_play and match.sport == :football and
          FootballInPlaySettlement.supported_snapshot?(odds.provider_snapshot || %{}) ->
        {:ok, :market_settlement_supported}

      bet_type == :in_play and match.sport == :cricket and
          CricketInPlaySettlement.supported_snapshot?(odds.provider_snapshot || %{}) ->
        {:ok, :market_settlement_supported}

      bet_type == :in_play and match.sport == :tennis and
          TennisInPlaySettlement.supported_snapshot?(odds.provider_snapshot || %{}) ->
        {:ok, :market_settlement_supported}

      true ->
        {:error, :market_settlement_not_supported}
    end
  end

  defp ensure_market_settlement_supported(_, %Odds{}) do
    {:error, :market_settlement_not_supported}
  end

  defp bettable_bet_types,
    do: [:match_winner, :over_under, :double_chance, :btts, :set_betting, :place]

  defp evaluate_bet_settlement(%Match{sport: :football} = match, %Odds{
         bet_type: :in_play,
         outcome: outcome,
         provider_snapshot: snapshot
       }) do
    FootballInPlaySettlement.settle(match, outcome, snapshot || %{})
  end

  defp evaluate_bet_settlement(%Match{sport: :cricket} = match, %Odds{
         bet_type: :in_play,
         outcome: outcome,
         provider_snapshot: snapshot
       }) do
    CricketInPlaySettlement.settle(match, outcome, snapshot || %{})
  end

  defp evaluate_bet_settlement(%Match{sport: :tennis} = match, %Odds{
         bet_type: :in_play,
         outcome: outcome,
         provider_snapshot: snapshot
       }) do
    TennisInPlaySettlement.settle(match, outcome, snapshot || %{})
  end

  defp evaluate_bet_settlement(%Match{sport: :football, winner: winner} = match, %Odds{
         bet_type: :double_chance,
         outcome: outcome
       }) do
    with {:ok, normalized_outcome} <- normalize_double_chance_outcome(match, outcome) do
      won =
        case normalized_outcome do
          :team1_or_draw -> winner == match.team1 or winner == "draw"
          :team2_or_draw -> winner == match.team2 or winner == "draw"
          :team1_or_team2 -> winner == match.team1 or winner == match.team2
        end

      {:ok, won, winner}
    end
  end

  defp evaluate_bet_settlement(%Match{sport: :football} = match, %Odds{
         bet_type: :btts,
         outcome: outcome
       }) do
    with {:ok, home_goals, away_goals} <- extract_football_goal_pair(match),
         {:ok, expected} <- parse_btts_outcome(outcome) do
      actual = home_goals > 0 and away_goals > 0
      {:ok, actual == expected, if(actual, do: "yes", else: "no")}
    end
  end

  defp evaluate_bet_settlement(%Match{sport: :tennis} = match, %Odds{
         bet_type: :set_betting,
         outcome: outcome
       }) do
    TennisSettlement.settle_set_betting(match, outcome)
  end

  defp evaluate_bet_settlement(%Match{sport: :horse_racing} = match, %Odds{
         bet_type: :place,
         outcome: outcome
       }) do
    RacingSettlement.settle_place(match, outcome)
  end

  defp evaluate_bet_settlement(%Match{winner: winner}, %Odds{
         bet_type: :match_winner,
         outcome: outcome
       }) do
    {:ok, outcome == winner, winner}
  end

  defp evaluate_bet_settlement(%Match{} = match, %Odds{bet_type: :over_under, outcome: outcome}) do
    with {:ok, total} <- extract_total_for_match(match),
         {:ok, direction, threshold} <- parse_over_under_outcome(outcome) do
      won =
        case direction do
          :over -> total > threshold
          :under -> total < threshold
        end

      {:ok, won, Decimal.to_string(total, :normal)}
    end
  end

  defp evaluate_bet_settlement(_match, %Odds{}), do: {:error, :market_settlement_not_supported}

  defp validate_odds_for_match(match, attrs, existing \\ nil) do
    if provider_import_source?(attrs, existing) do
      :ok
    else
      do_validate_odds_for_match(match, attrs, existing)
    end
  end

  defp do_validate_odds_for_match(match, attrs, existing) do
    bet_type = attr_or_existing(attrs, existing, :bet_type)
    outcome = attr_or_existing(attrs, existing, :outcome)
    odds_value = attr_or_existing(attrs, existing, :odds_value)

    OddsRules.validate(match, bet_type, outcome, odds_value)
  end

  defp attr_or_existing(attrs, nil, key), do: attrs[to_string(key)] || attrs[key]

  defp attr_or_existing(attrs, existing, key),
    do: attrs[to_string(key)] || attrs[key] || Map.get(existing, key)

  defp attr_val(attrs, key) when is_map(attrs) do
    Map.get(attrs, to_string(key), Map.get(attrs, key))
  end

  defp get_latest_draft_version(match_id) do
    Repo.one(
      from o in Odds,
        where:
          o.match_id == ^match_id and o.visibility_status == :draft and
            o.source_type == "platform",
        select: max(o.version_no)
    )
  end

  defp provider_import_source?(attrs, existing) do
    case attr_or_existing(attrs, existing, :source_type) do
      "provider_import" -> true
      :provider_import -> true
      _ -> false
    end
  end

  defp parse_over_under_outcome(outcome) when is_binary(outcome) do
    normalized =
      outcome
      |> String.trim()
      |> String.downcase()
      |> String.replace(" ", "_")

    cond do
      String.starts_with?(normalized, "over_") ->
        parse_over_under_threshold(String.replace_prefix(normalized, "over_", ""))
        |> case do
          {:ok, threshold} -> {:ok, :over, threshold}
          err -> err
        end

      String.starts_with?(normalized, "under_") ->
        parse_over_under_threshold(String.replace_prefix(normalized, "under_", ""))
        |> case do
          {:ok, threshold} -> {:ok, :under, threshold}
          err -> err
        end

      true ->
        {:error, :invalid_market_outcome}
    end
  end

  defp parse_over_under_outcome(_), do: {:error, :invalid_market_outcome}

  defp parse_over_under_threshold(raw) do
    normalized =
      raw
      |> String.replace("_", ".")
      |> String.trim()

    case Decimal.parse(normalized) do
      {%Decimal{} = value, ""} -> {:ok, value}
      _ -> {:error, :invalid_market_outcome}
    end
  end

  defp extract_total_for_match(%Match{sport: :football} = match),
    do: extract_football_total(match)

  defp extract_total_for_match(%Match{sport: :cricket} = match), do: extract_cricket_total(match)
  defp extract_total_for_match(%Match{sport: :tennis} = match), do: extract_tennis_total(match)
  defp extract_total_for_match(_), do: {:error, :market_settlement_not_supported}

  defp extract_football_total(%Match{} = match) do
    with {:ok, home, away} <- extract_football_goal_pair(match) do
      {:ok, Decimal.new(home + away)}
    end
  end

  defp extract_football_goal_pair(%Match{} = match) do
    score = match.score || %{}
    raw = match.raw_data || %{}
    nested_score = normalize_score_container(get_in(score, ["score"]))

    home =
      first_integer([
        get_in(nested_score, ["home"]),
        get_in(nested_score, [:home]),
        get_in(nested_score, ["home_score"]),
        get_in(nested_score, ["fulltime", "home"]),
        get_in(nested_score, ["full_time", "home"]),
        get_in(nested_score, ["goals", "home"]),
        get_in(raw, ["goals", "home"]),
        get_in(raw, ["score", "home"])
      ])

    away =
      first_integer([
        get_in(nested_score, ["away"]),
        get_in(nested_score, [:away]),
        get_in(nested_score, ["away_score"]),
        get_in(nested_score, ["fulltime", "away"]),
        get_in(nested_score, ["full_time", "away"]),
        get_in(nested_score, ["goals", "away"]),
        get_in(raw, ["goals", "away"]),
        get_in(raw, ["score", "away"])
      ])

    cond do
      is_integer(home) and is_integer(away) ->
        {:ok, home, away}

      is_binary(get_in(score, ["score"])) ->
        parse_goal_pair_from_string(get_in(score, ["score"]))

      is_binary(get_in(raw, ["score"])) ->
        parse_goal_pair_from_string(get_in(raw, ["score"]))

      true ->
        {:error, :market_settlement_not_supported}
    end
  end

  defp extract_cricket_total(%Match{} = match) do
    score = get_in(match.score || %{}, ["score"]) || %{}
    raw_score = get_in(match.raw_data || %{}, ["score"]) || score

    innings =
      cond do
        is_list(raw_score) -> raw_score
        is_list(score) -> score
        true -> []
      end

    case innings do
      [_ | _] ->
        total_runs =
          innings
          |> Enum.map(fn row ->
            first_integer([
              row["r"],
              row[:r],
              row["runs"],
              row[:runs],
              row["score"],
              row[:score]
            ]) || 0
          end)
          |> Enum.sum()

        {:ok, Decimal.new(total_runs)}

      _ ->
        total_from_score_string(extract_string_score(raw_score) || extract_string_score(score))
    end
  end

  defp extract_tennis_total(%Match{} = match) do
    score = get_in(match.score || %{}, ["score"])
    raw = match.raw_data || %{}

    total =
      first_positive_total([
        get_in(raw, ["result", "scores"]),
        get_in(raw, ["scores"]),
        get_in(raw, ["score"]),
        score,
        get_in(raw, ["result", "game_result"]),
        get_in(raw, ["event_game_result"]),
        get_in(raw, ["event_final_result"])
      ])

    if total > 0 do
      {:ok, Decimal.new(total)}
    else
      {:error, :market_settlement_not_supported}
    end
  end

  defp total_from_score_string(nil), do: {:error, :market_settlement_not_supported}

  defp total_from_score_string(value) when is_binary(value) do
    with {:ok, runs} <- parse_cricket_runs_from_string(value) do
      if runs > 0,
        do: {:ok, Decimal.new(runs)},
        else: {:error, :market_settlement_not_supported}
    end
  end

  defp total_from_score_string(_), do: {:error, :market_settlement_not_supported}

  defp parse_goal_pair_from_string(value) when is_binary(value) do
    normalized = String.trim(value)

    case Regex.run(~r/(?:^|\b)(\d{1,2})\s*[-:]\s*(\d{1,2})(?:\b|$)/, normalized) do
      [_, home, away] ->
        {:ok, String.to_integer(home), String.to_integer(away)}

      _ ->
        case normalized
             |> Regex.scan(~r/\d+/)
             |> List.flatten()
             |> Enum.map(&String.to_integer/1)
             |> Enum.take(-2) do
          [home, away] -> {:ok, home, away}
          _ -> {:error, :market_settlement_not_supported}
        end
    end
  end

  defp parse_goal_pair_from_string(_), do: {:error, :market_settlement_not_supported}

  defp normalize_score_container(%{} = value), do: value
  defp normalize_score_container(_), do: %{}

  defp parse_cricket_runs_from_string(value) when is_binary(value) do
    normalized = String.trim(value)

    case Regex.run(~r/(?:^|\s)(\d{1,3})\s*\/\s*\d{1,2}(?:\s|$)/, normalized) do
      [_, runs] ->
        {:ok, String.to_integer(runs)}

      _ ->
        case Regex.run(~r/(\d{1,3})/, normalized) do
          [_, runs] -> {:ok, String.to_integer(runs)}
          _ -> {:error, :market_settlement_not_supported}
        end
    end
  end

  defp parse_cricket_runs_from_string(_), do: {:error, :market_settlement_not_supported}

  defp sum_integers_from_term(value) when is_list(value) do
    value
    |> Enum.map(&sum_integers_from_term/1)
    |> Enum.sum()
  end

  defp sum_integers_from_term(value) when is_map(value) do
    value
    |> Map.values()
    |> Enum.map(&sum_integers_from_term/1)
    |> Enum.sum()
  end

  defp sum_integers_from_term(value) when is_integer(value), do: value
  defp sum_integers_from_term(value) when is_float(value), do: trunc(value)

  defp sum_integers_from_term(value) when is_binary(value) do
    Regex.scan(~r/\d+/, value)
    |> List.flatten()
    |> Enum.map(&String.to_integer/1)
    |> Enum.sum()
  end

  defp sum_integers_from_term(_), do: 0

  defp first_positive_total(values) when is_list(values) do
    Enum.find_value(values, 0, fn value ->
      total = sum_integers_from_term(value)
      if total > 0, do: total, else: nil
    end)
  end

  defp extract_string_score(value) when is_binary(value), do: value

  defp extract_string_score(value) when is_map(value) do
    Enum.find_value(Map.values(value), &extract_string_score/1)
  end

  defp extract_string_score(_), do: nil

  defp first_integer(values) when is_list(values) do
    Enum.find_value(values, fn
      value when is_integer(value) ->
        value

      value when is_float(value) ->
        trunc(value)

      value when is_binary(value) ->
        case Integer.parse(String.trim(value)) do
          {parsed, _} -> parsed
          _ -> nil
        end

      _ ->
        nil
    end)
  end

  defp normalize_double_chance_outcome(%Match{} = match, outcome) when is_binary(outcome) do
    normalized =
      outcome
      |> String.trim()
      |> String.downcase()
      |> String.replace(" ", "_")

    team1 = normalize_team_name(match.team1)
    team2 = normalize_team_name(match.team2)

    cond do
      normalized == "#{team1}_or_draw" -> {:ok, :team1_or_draw}
      normalized == "#{team2}_or_draw" -> {:ok, :team2_or_draw}
      normalized == "#{team1}_or_#{team2}" -> {:ok, :team1_or_team2}
      normalized == "team1_or_draw" -> {:ok, :team1_or_draw}
      normalized == "team2_or_draw" -> {:ok, :team2_or_draw}
      normalized == "team1_or_team2" -> {:ok, :team1_or_team2}
      true -> {:error, :invalid_market_outcome}
    end
  end

  defp normalize_double_chance_outcome(_, _), do: {:error, :invalid_market_outcome}

  defp parse_btts_outcome(value) when is_binary(value) do
    case value |> String.trim() |> String.downcase() do
      "yes" -> {:ok, true}
      "no" -> {:ok, false}
      _ -> {:error, :invalid_market_outcome}
    end
  end

  defp parse_btts_outcome(_), do: {:error, :invalid_market_outcome}

  defp normalize_team_name(value) do
    value
    |> to_string()
    |> String.trim()
    |> String.downcase()
    |> String.replace(" ", "_")
  end

  defp find_existing_external_match(provider, external_id) do
    Repo.get_by(Match, provider: provider, external_id: external_id)
  end

  defp maybe_log_admin_action(actor_id, action, target_type, target_id, payload) do
    _ =
      Admin.log_action(%{
        actor_id: actor_id,
        action: action,
        target_type: target_type,
        target_id: target_id,
        payload: payload,
        ip_address: payload[:ip_address] || payload["ip_address"],
        user_agent: payload[:user_agent] || payload["user_agent"]
      })

    :ok
  end

  defp maybe_log_bet_rejection(user_id, match_id, odds_id, stake, reason) do
    tracked_reason =
      case reason do
        :betting_locked -> :betting_locked
        :stake_limit_exceeded -> :stake_limit_exceeded
        :odds_stake_limit_exceeded -> :odds_stake_limit_exceeded
        :payout_limit_exceeded -> :payout_limit_exceeded
        :daily_exposure_exceeded -> :daily_exposure_exceeded
        :stale_quote -> :stale_quote
        :market_suspended -> :market_suspended
        :in_play_not_enabled -> :in_play_not_enabled
        _ -> nil
      end

    if tracked_reason do
      attrs = %{
        user_id: user_id,
        match_id: match_id,
        odds_id: odds_id,
        stake: stake,
        reason: to_string(tracked_reason),
        metadata: %{
          "source" => "bet_placement",
          "tracked_at" => DateTime.utc_now() |> DateTime.to_iso8601()
        }
      }

      _ = %BetRejectionLog{} |> BetRejectionLog.changeset(attrs) |> Repo.insert()
      :ok
    else
      :ok
    end
  end
end
