defmodule Back.Live.CricketSportmonksConsumer do
  @moduledoc false

  use GenServer

  import Ecto.Query

  alias Back.Betting.Match
  alias Back.Repo
  alias Back.State.CricketRouter
  alias Back.State.MatchLiveEvent

  @type start_opt :: GenServer.option()
  @type ingest_result :: :ok
  @type state :: %{}

  @spec start_link([start_opt()]) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, %{}, Keyword.put_new(opts, :name, __MODULE__))
  end

  @spec ingest_event(map()) :: ingest_result()
  def ingest_event(event) when is_map(event) do
    GenServer.cast(__MODULE__, {:ingest_event, event})
  end

  @spec process_event(map()) ::
          {:ok, :processed | :duplicate | :ignored | :stale} | {:error, term()}
  def process_event(payload) when is_map(payload) do
    with {:ok, normalized} <- normalize_payload(payload),
         {:ok, match} <- fetch_match(normalized),
         {:ok, result} <- persist_event_and_state(match, normalized) do
      case result do
        %{status: :processed, match: updated_match, decision: decision, event: live_event} ->
          CricketRouter.broadcast_transition(updated_match, live_event, decision)
          {:ok, :processed}

        %{status: :duplicate} ->
          {:ok, :duplicate}

        %{status: :stale} ->
          {:ok, :stale}

        _ ->
          {:ok, :ignored}
      end
    end
  end

  @impl true
  def init(_state), do: {:ok, %{}}

  @impl true
  def handle_cast({:ingest_event, event}, state) do
    Task.Supervisor.start_child(Back.TaskSupervisor, fn ->
      _ = process_event(event)
    end)

    {:noreply, state}
  end

  @impl true
  def handle_info(_message, state), do: {:noreply, state}

  defp fetch_match(%{external_match_id: external_match_id}) do
    case Repo.one(
           from m in Match,
             where: m.provider == "sportmonks" and m.external_id == ^external_match_id,
             limit: 1
         ) do
      %Match{} = match -> {:ok, match}
      nil -> {:error, :match_not_found}
    end
  end

  defp persist_event_and_state(%Match{} = match, normalized) do
    Repo.transaction(fn ->
      locked_match =
        Repo.one!(
          from m in Match,
            where: m.id == ^match.id,
            lock: "FOR UPDATE"
        )

      cond do
        normalized.event_seq < locked_match.live_event_seq ->
          %{status: :stale}

        duplicate_event?(locked_match.id, normalized) ->
          %{status: :duplicate}

        true ->
          decision = CricketRouter.classify_event(normalized, locked_match)
          next_state = build_next_match_state(locked_match, normalized, decision)

          {:ok, updated_match} =
            locked_match
            |> Match.live_state_changeset(next_state)
            |> Repo.update()

          {:ok, live_event} =
            %MatchLiveEvent{}
            |> MatchLiveEvent.changeset(%{
              match_id: updated_match.id,
              provider: "sportmonks",
              provider_event_id: normalized.provider_event_id,
              event_seq: normalized.event_seq,
              state_version: updated_match.live_state_version,
              event_type: normalized.event_type,
              severity: Atom.to_string(decision.severity),
              inning: next_state.current_innings,
              over: next_state.current_over,
              ball_in_over: next_state.current_ball_in_over,
              event_time: normalized.event_time,
              source_status: normalized.source_status,
              suspension_trigger: decision.requires_suspend,
              processed_at: DateTime.utc_now() |> DateTime.truncate(:second),
              payload: normalized.raw_payload
            })
            |> Repo.insert()

          %{status: :processed, match: updated_match, decision: decision, event: live_event}
      end
    end)
  end

  defp duplicate_event?(match_id, %{event_seq: event_seq, provider_event_id: provider_event_id}) do
    seq_exists? =
      Repo.exists?(
        from e in MatchLiveEvent,
          where: e.match_id == ^match_id and e.event_seq == ^event_seq
      )

    provider_exists? =
      if is_binary(provider_event_id) and provider_event_id != "" do
        Repo.exists?(
          from e in MatchLiveEvent,
            where: e.provider == "sportmonks" and e.provider_event_id == ^provider_event_id
        )
      else
        false
      end

    seq_exists? or provider_exists?
  end

  defp build_next_match_state(%Match{} = match, normalized, decision) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    current_momentum = decimal_to_float(match.momentum_index)
    next_momentum = CricketRouter.next_momentum(current_momentum, decision)
    next_status = normalized.match_status || match.status
    full_board_suspend? = should_full_board_suspend?(match, decision)

    %{
      status: next_status,
      in_play_enabled: next_status == :live,
      score: normalized.score_map,
      raw_data: Map.merge(match.raw_data || %{}, normalized.raw_payload),
      live_state_version: match.live_state_version + 1,
      live_event_seq: max(match.live_event_seq, normalized.event_seq),
      current_innings: pick(normalized.current_innings, match.current_innings),
      current_over: pick(normalized.current_over, match.current_over),
      current_ball_in_over: pick(normalized.current_ball_in_over, match.current_ball_in_over),
      batting_team: pick(normalized.batting_team, match.batting_team),
      bowling_team: pick(normalized.bowling_team, match.bowling_team),
      runs_total: pick(normalized.runs_total, match.runs_total),
      wickets_total: pick(normalized.wickets_total, match.wickets_total),
      target_runs: pick(normalized.target_runs, match.target_runs),
      required_run_rate: pick(normalized.required_run_rate, match.required_run_rate),
      current_run_rate: pick(normalized.current_run_rate, match.current_run_rate),
      momentum_index: Decimal.from_float(next_momentum),
      suspended_markets: match.suspended_markets || %{},
      market_state:
        next_market_state(match.market_state || %{}, decision, normalized, full_board_suspend?),
      last_ball_event_type: normalized.event_type,
      last_live_event_at: normalized.event_time || now,
      suspended_at: if(full_board_suspend?, do: now, else: nil),
      suspension_reason:
        if(full_board_suspend?,
          do: CricketRouter.suspension_reason(decision),
          else: nil
        )
    }
  end

  defp next_market_state(current_state, decision, normalized, true) do
    CricketRouter.next_market_state(current_state, decision, normalized)
  end

  defp next_market_state(current_state, decision, normalized, false) do
    non_suspending_decision = %{decision | requires_suspend: false}
    CricketRouter.next_market_state(current_state, non_suspending_decision, normalized)
  end

  defp should_full_board_suspend?(%Match{} = match, decision) do
    _ = match

    decision.requires_suspend == true and
      decision.reason in [
        :rain_break,
        :rain_delay,
        :third_umpire_review,
        :innings_break,
        :super_over,
        :match_end
      ]
  end

  defp normalize_payload(payload) do
    external_match_id =
      first_string([
        get_in(payload, ["fixture", "id"]),
        payload["fixture_id"],
        payload["match_id"],
        payload["id"],
        get_in(payload, ["fixture_id"])
      ])

    event_seq =
      first_integer([
        payload["event_seq"],
        payload["sequence"],
        payload["ball_sequence"],
        payload["ball_id"],
        payload["id"],
        get_in(payload, ["ball", "id"])
      ]) || derived_event_seq(payload)

    if is_binary(external_match_id) and is_integer(event_seq) do
      {:ok,
       %{
         external_match_id: external_match_id,
         provider_event_id:
           first_string([
             payload["provider_event_id"],
             payload["event_id"],
             payload["ball_id"],
             payload["id"]
           ]),
         event_seq: event_seq,
         event_type: CricketRouter.normalize_event_type(payload),
         source_status: first_string([payload["status"], get_in(payload, ["status", "type"])]),
         event_time:
           normalize_datetime(
             first_string([
               payload["event_time"],
               payload["updated_at"],
               payload["timestamp"],
               get_in(payload, ["score", "updated_at"]),
               get_in(payload, ["ball", "time"])
             ])
           ),
         current_innings:
           first_integer([
             payload["inning"],
             payload["innings"],
             get_in(payload, ["scoreboard", "innings"]),
             get_in(payload, ["score", "innings"])
           ]) || 0,
         current_over:
           normalize_decimal(
             first_string([
               payload["over"],
               payload["overs"],
               get_in(payload, ["ball", "over"]),
               get_in(payload, ["scoreboard", "overs"]),
               get_in(payload, ["score", "overs"])
             ]) ||
               payload["over_number"]
           ),
         current_ball_in_over:
           first_integer([
             payload["ball_in_over"],
             payload["ball"],
             payload["delivery"],
             get_in(payload, ["ball", "number"]),
             get_in(payload, ["score", "current_ball_in_over"])
           ]) || 0,
         batting_team:
           first_string([
             get_in(payload, ["batting_team", "name"]),
             payload["batting_team"],
             payload["batting"],
             get_in(payload, ["score", "batting_team"])
           ]),
         bowling_team:
           first_string([
             get_in(payload, ["bowling_team", "name"]),
             payload["bowling_team"],
             payload["bowling"],
             get_in(payload, ["score", "bowling_team"])
           ]),
         runs_total:
           first_integer([
             get_in(payload, ["scoreboard", "runs_total"]),
             payload["runs_total"],
             payload["score"],
             get_in(payload, ["total", "runs"]),
             get_in(payload, ["score", "runs"]),
             get_in(payload, ["score", "total", "runs"])
           ]) || 0,
         wickets_total:
           first_integer([
             get_in(payload, ["scoreboard", "wickets_total"]),
             payload["wickets_total"],
             get_in(payload, ["total", "wickets"]),
             get_in(payload, ["score", "wickets"]),
             get_in(payload, ["score", "total", "wickets"])
           ]) || 0,
         target_runs:
           first_integer([
             payload["target_runs"],
             get_in(payload, ["scoreboard", "target_runs"])
           ]),
         required_run_rate:
           normalize_decimal(
             payload["required_run_rate"] || get_in(payload, ["scoreboard", "required_run_rate"])
           ),
         current_run_rate:
           normalize_decimal(
             payload["current_run_rate"] || get_in(payload, ["scoreboard", "current_run_rate"])
           ),
         match_status: CricketRouter.normalize_match_status(payload),
         score_map: %{
           "score" => payload["score"] || get_in(payload, ["scoreboard", "display"]) || %{}
         },
         raw_payload: payload
       }}
    else
      {:error, :invalid_payload}
    end
  end

  defp first_string(values) do
    Enum.find_value(values, fn
      value when is_binary(value) ->
        trimmed = String.trim(value)
        if trimmed == "", do: nil, else: trimmed

      value when is_integer(value) ->
        Integer.to_string(value)

      _ ->
        nil
    end)
  end

  defp first_integer(values) do
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

  defp normalize_datetime(nil), do: DateTime.utc_now() |> DateTime.truncate(:second)

  defp normalize_datetime(value) when is_binary(value) do
    case DateTime.from_iso8601(value) do
      {:ok, dt, _offset} -> dt
      _ -> DateTime.utc_now() |> DateTime.truncate(:second)
    end
  end

  defp normalize_datetime(_), do: DateTime.utc_now() |> DateTime.truncate(:second)

  defp derived_event_seq(payload) when is_map(payload) do
    timestamp =
      first_string([
        payload["event_time"],
        payload["updated_at"],
        payload["timestamp"],
        get_in(payload, ["score", "updated_at"])
      ])

    over_number =
      first_integer([
        payload["over_number"],
        payload["over"],
        payload["overs"],
        get_in(payload, ["scoreboard", "overs"]),
        get_in(payload, ["score", "overs"])
      ]) || 0

    ball_number =
      first_integer([
        payload["ball_in_over"],
        payload["ball"],
        payload["delivery"],
        get_in(payload, ["ball", "number"]),
        get_in(payload, ["score", "current_ball_in_over"])
      ]) || 0

    case parse_unix_milliseconds(timestamp) do
      nil -> nil
      unix_millis -> unix_millis * 100 + over_number * 10 + ball_number
    end
  end

  defp derived_event_seq(_), do: nil

  defp parse_unix_milliseconds(nil), do: nil

  defp parse_unix_milliseconds(value) when is_binary(value) do
    case DateTime.from_iso8601(value) do
      {:ok, dt, _offset} -> DateTime.to_unix(dt, :millisecond)
      _ -> nil
    end
  end

  defp parse_unix_milliseconds(_), do: nil

  defp decimal_to_float(nil), do: 0.0
  defp decimal_to_float(%Decimal{} = value), do: Decimal.to_float(value)
  defp decimal_to_float(value) when is_float(value), do: value
  defp decimal_to_float(value) when is_integer(value), do: value * 1.0

  defp pick(nil, fallback), do: fallback
  defp pick(value, _fallback), do: value
end
