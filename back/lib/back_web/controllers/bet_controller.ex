defmodule BackWeb.BetController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Betting
  alias Back.Auth.Guardian
  alias BackWeb.JsonHelpers

  # POST /api/bets
  def create(conn, %{"match_id" => match_id, "odds_id" => odds_id, "stake" => stake} = params) do
    user = Guardian.Plug.current_resource(conn)
    in_play = Map.get(params, "in_play", false)

    execution_context = %{
      "match_state_version" => params["match_state_version"],
      "odds_version_no" => params["odds_version_no"],
      "market_key" => params["market_key"],
      "selection_key" => params["selection_key"],
      "quoted_odds_value" => params["quoted_odds_value"],
      "client_snapshot" => params["client_snapshot"]
    }

    result =
      if in_play do
        Betting.place_in_play_bet(user.id, match_id, odds_id, stake, execution_context)
      else
        Betting.place_bet(user.id, match_id, odds_id, stake, execution_context)
      end

    with {:ok, %{bet: bet}} <- result do
      conn |> put_status(:created) |> json(%{data: bet_json(bet)})
    end
  end

  # GET /api/bets
  def index(conn, params) do
    user = Guardian.Plug.current_resource(conn)

    filters =
      []
      |> maybe_filter(:status, params["status"])
      |> maybe_filter(:in_play, params["in_play"])

    bets = Betting.list_user_bets(user.id, filters)
    json(conn, %{data: Enum.map(bets, &bet_json/1)})
  end

  # GET /api/bets/:id
  def show(conn, %{"id" => id}) do
    user = Guardian.Plug.current_resource(conn)
    bet = Betting.get_bet!(id)

    if bet.user_id == user.id do
      json(conn, %{data: bet_json(bet)})
    else
      conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  # DELETE /api/bets/:id
  def cancel(conn, %{"id" => id}) do
    user = Guardian.Plug.current_resource(conn)
    bet = Betting.get_bet!(id)

    if bet.user_id != user.id do
      conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    else
      with {:ok, %{bet: cancelled}} <- Betting.cancel_bet(bet) do
        json(conn, %{data: bet_json(cancelled)})
      end
    end
  end

  # GET /api/super-admin/bets  (admin view — all bets)
  def admin_index(conn, params) do
    filters =
      []
      |> maybe_filter(:status, params["status"])

    bets =
      case params["match_id"] do
        nil -> all_bets(filters)
        match_id -> Betting.list_bets_by_match(match_id)
      end

    json(conn, %{data: Enum.map(bets, &bet_json/1)})
  end

  defp all_bets(filters) do
    import Ecto.Query
    alias Back.Betting.Bet
    alias Back.Repo

    Bet
    |> apply_filters(filters)
    |> order_by([b], desc: b.inserted_at)
    |> Repo.all()
  end

  defp apply_filters(query, filters) do
    import Ecto.Query

    Enum.reduce(filters, query, fn
      {:status, status}, q -> where(q, [b], b.status == ^status)
      _, q -> q
    end)
  end

  defp bet_json(b) do
    JsonHelpers.json_safe(%{
      id: b.id,
      user_id: b.user_id,
      match_id: b.match_id,
      odds_id: b.odds_id,
      stake: b.stake,
      potential_win: b.potential_win,
      status: b.status,
      is_in_play: b.is_in_play,
      result: b.result,
      settled_at: b.settled_at,
      inserted_at: b.inserted_at
    })
  end

  defp maybe_filter(filters, _key, nil), do: filters
  defp maybe_filter(filters, :in_play, "true"), do: [{:in_play, true} | filters]
  defp maybe_filter(filters, :in_play, _), do: filters
  defp maybe_filter(filters, key, val), do: [{key, String.to_existing_atom(val)} | filters]
end
