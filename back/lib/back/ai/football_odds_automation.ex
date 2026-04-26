defmodule Back.AI.FootballOddsAutomation do
  @moduledoc false

  import Ecto.Query

  alias Back.AI.Automation.FeedConfig
  alias Back.AI.Automation.OddsAutomationRun
  alias Back.AI.PlatformOdds.DraftGenerator
  alias Back.Betting.Match
  alias Back.Betting.Odds
  alias Back.Providers.CompetitionFeed
  alias Back.Repo
  alias Back.Settings

  def run_for_feed(feed, kind, match_ids, opts \\ [])

  def run_for_feed(%CompetitionFeed{sport: "football"} = feed, kind, match_ids, opts)
      when kind in [:fixtures, :live] and is_list(match_ids) do
    trigger = Keyword.get(opts, :trigger, default_trigger(kind))

    matches =
      Match
      |> where([m], m.competition_feed_id == ^feed.id and m.id in ^Enum.uniq(match_ids))
      |> Repo.all()

    summary =
      Enum.reduce(
        matches,
        %{prematch: empty_phase_summary(), inplay: empty_phase_summary()},
        fn match, acc ->
          acc
          |> maybe_run_phase(feed, match, :prematch, kind, trigger)
          |> maybe_run_phase(feed, match, :inplay, kind, trigger)
        end
      )

    {:ok, summary}
  rescue
    Postgrex.Error ->
      {:ok,
       %{
         prematch: empty_phase_summary(),
         inplay: empty_phase_summary(),
         skipped: "automation_storage_unavailable"
       }}
  end

  def run_for_feed(_, _, _, _),
    do: {:ok, %{prematch: empty_phase_summary(), inplay: empty_phase_summary()}}

  defp maybe_run_phase(summary, feed, match, :prematch, kind, trigger) do
    if kind == :fixtures and FeedConfig.prematch_enabled?(feed) do
      update_phase_summary(summary, :prematch, run_phase(feed, match, :prematch, trigger))
    else
      summary
    end
  end

  defp maybe_run_phase(summary, feed, match, :inplay, kind, trigger) do
    if kind == :live and FeedConfig.inplay_enabled?(feed) do
      update_phase_summary(summary, :inplay, run_phase(feed, match, :inplay, trigger))
    else
      summary
    end
  end

  defp run_phase(feed, match, :prematch, trigger) do
    cond do
      match.status != :upcoming ->
        log_run(feed, match, :prematch, :skipped, trigger, reason: "match_not_upcoming")

      not within_prematch_window?(match, feed) ->
        log_run(feed, match, :prematch, :skipped, trigger, reason: "outside_prematch_window")

      has_platform_odds?(match.id, FeedConfig.prematch_bet_types(feed)) ->
        log_run(feed, match, :prematch, :skipped, trigger, reason: "platform_odds_already_exist")

      reached_phase_limit?(feed, match.id, :prematch) ->
        log_run(feed, match, :prematch, :skipped, trigger, reason: "max_runs_reached")

      true ->
        generate_phase(feed, match, :prematch, trigger)
    end
  end

  defp run_phase(feed, match, :inplay, trigger) do
    state_hash = inplay_state_hash(match)

    cond do
      match.status != :live ->
        log_run(feed, match, :inplay, :skipped, trigger,
          reason: "match_not_live",
          state_hash: state_hash
        )

      not match.in_play_enabled ->
        log_run(feed, match, :inplay, :skipped, trigger,
          reason: "in_play_not_enabled",
          state_hash: state_hash
        )

      reached_phase_limit?(feed, match.id, :inplay) ->
        log_run(feed, match, :inplay, :skipped, trigger,
          reason: "max_runs_reached",
          state_hash: state_hash
        )

      should_skip_inplay_run?(feed, match.id, state_hash) ->
        log_run(feed, match, :inplay, :skipped, trigger,
          reason: "state_unchanged_or_rate_limited",
          state_hash: state_hash
        )

      true ->
        generate_phase(feed, match, :inplay, trigger, state_hash: state_hash)
    end
  end

  defp generate_phase(feed, match, phase, trigger, extra \\ [])

  defp generate_phase(feed, match, :prematch, trigger, _extra) do
    bet_types = FeedConfig.prematch_bet_types(feed)
    model = automation_model(feed)
    admin_note = "Auto-generated prematch draft for #{feed.name}"

    case DraftGenerator.generate_for_match(match, bet_types, model: model, admin_note: admin_note) do
      {:ok, result} ->
        log_run(feed, match, :prematch, :success, trigger,
          generated_count: result.count,
          model: resolved_model(model),
          metadata: %{
            "version_no" => result.version_no,
            "bet_types" => Enum.map(bet_types, &to_string/1)
          }
        )

      {:error, reason} ->
        log_run(feed, match, :prematch, :failure, trigger,
          reason: inspect(reason),
          model: resolved_model(model)
        )
    end
  end

  defp generate_phase(feed, match, :inplay, trigger, extra) do
    bet_types = FeedConfig.inplay_bet_types(feed)
    model = automation_model(feed)
    admin_note = "Auto-generated in-play draft for #{feed.name}"

    case DraftGenerator.generate_for_match(match, bet_types, model: model, admin_note: admin_note) do
      {:ok, result} ->
        log_run(feed, match, :inplay, :success, trigger,
          generated_count: result.count,
          model: resolved_model(model),
          state_hash: Keyword.get(extra, :state_hash),
          metadata: %{
            "version_no" => result.version_no,
            "bet_types" => Enum.map(bet_types, &to_string/1)
          }
        )

      {:error, reason} ->
        log_run(feed, match, :inplay, :failure, trigger,
          reason: inspect(reason),
          model: resolved_model(model),
          state_hash: Keyword.get(extra, :state_hash)
        )
    end
  end

  defp within_prematch_window?(%Match{start_time: %DateTime{} = start_time}, feed) do
    diff = DateTime.diff(start_time, DateTime.utc_now(), :second)
    diff >= 0 and diff <= FeedConfig.prematch_window_minutes(feed) * 60
  end

  defp within_prematch_window?(_, _), do: false

  defp should_skip_inplay_run?(feed, match_id, state_hash) do
    case latest_successful_run(match_id, :inplay) do
      nil ->
        false

      run ->
        same_state = run.state_hash == state_hash

        recent =
          DateTime.diff(DateTime.utc_now(), run.inserted_at, :second) <
            FeedConfig.inplay_interval_seconds(feed)

        same_state or recent
    end
  end

  defp reached_phase_limit?(feed, match_id, phase) do
    count =
      Repo.one(
        from r in OddsAutomationRun,
          where:
            r.match_id == ^match_id and r.phase == ^to_string(phase) and r.status == "success",
          select: count(r.id)
      ) || 0

    count >= FeedConfig.max_runs_per_match(feed)
  end

  defp latest_successful_run(match_id, phase) do
    Repo.one(
      from r in OddsAutomationRun,
        where: r.match_id == ^match_id and r.phase == ^to_string(phase) and r.status == "success",
        order_by: [desc: r.inserted_at],
        limit: 1
    )
  end

  defp has_platform_odds?(match_id, bet_types) do
    Repo.exists?(
      from o in Odds,
        where:
          o.match_id == ^match_id and o.source_type == "platform" and o.bet_type in ^bet_types
    )
  end

  defp inplay_state_hash(match) do
    payload = %{
      status: match.status,
      score: match.score,
      raw_score: get_in(match.raw_data || %{}, ["score"]),
      goals: get_in(match.raw_data || %{}, ["goals"]),
      elapsed: get_in(match.raw_data || %{}, ["fixture", "status", "elapsed"])
    }

    :sha256
    |> :crypto.hash(Jason.encode!(payload))
    |> Base.encode16(case: :lower)
  end

  defp log_run(feed, match, phase, status, trigger, opts) do
    attrs = %{
      match_id: match.id,
      competition_feed_id: feed.id,
      phase: to_string(phase),
      status: to_string(status),
      trigger: to_string(trigger),
      model: Keyword.get(opts, :model),
      generated_count: Keyword.get(opts, :generated_count, 0),
      state_hash: Keyword.get(opts, :state_hash),
      reason: Keyword.get(opts, :reason),
      metadata: Keyword.get(opts, :metadata, %{})
    }

    case %OddsAutomationRun{} |> OddsAutomationRun.changeset(attrs) |> Repo.insert() do
      {:ok, _run} -> status
      _ -> status
    end
  end

  defp update_phase_summary(summary, phase, status) do
    Map.update!(summary, phase, fn phase_summary ->
      Map.update!(phase_summary, status, &(&1 + 1))
    end)
  end

  defp empty_phase_summary, do: %{success: 0, failure: 0, skipped: 0}

  defp automation_model(feed), do: (feed.config || %{})["automation_model"]

  defp resolved_model(nil) do
    Settings.get(
      "openrouter_active_model",
      Application.get_env(:back, :openrouter_default_model, "openai/gpt-4o-mini")
    )
  end

  defp resolved_model(model), do: model

  defp default_trigger(:fixtures), do: :scheduled_fixtures
  defp default_trigger(:live), do: :scheduled_live
end
