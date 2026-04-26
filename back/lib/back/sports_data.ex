defmodule Back.SportsData do
  import Ecto.Query

  alias Back.Repo
  alias Back.SportsData.RejectedEvent
  alias Back.SportsData.Redactor
  alias Back.SportsData.SportsEvent
  alias Back.SportsData.SyncLog

  @conflict_fields [
    :sport,
    :competition_name,
    :status,
    :start_time_utc,
    :participants,
    :result,
    :raw
  ]

  def upsert_events(events) when is_list(events) do
    {upserted_count, failed} =
      Enum.reduce(events, {0, []}, fn attrs, {count, errors} ->
        case upsert_event(attrs) do
          {:ok, _event} -> {count + 1, errors}
          {:error, reason} -> {count, [format_error(attrs, reason) | errors]}
        end
      end)

    {:ok,
     %{
       upserted_count: upserted_count,
       failed_count: length(failed),
       errors: Enum.reverse(failed)
     }}
  end

  def upsert_event(attrs) when is_map(attrs) do
    %SportsEvent{}
    |> SportsEvent.changeset(attrs)
    |> Repo.insert(
      on_conflict: {:replace, @conflict_fields},
      conflict_target: [:provider, :provider_event_id],
      returning: true
    )
    |> case do
      {:ok, _event} = ok ->
        maybe_clear_rejection(attrs)
        ok

      {:error, reason} = error ->
        _ = quarantine_event(attrs, reason, "upsert_event")
        error
    end
  end

  def list_events(filters \\ %{}) do
    SportsEvent
    |> apply_filters(filters)
    |> order_by([e], asc: e.start_time_utc)
    |> maybe_limit(filters)
    |> Repo.all()
  end

  def get_event(provider, provider_event_id)
      when provider in [:api_tennis, :goalserve, :betsapi] and is_binary(provider_event_id) do
    Repo.get_by(SportsEvent, provider: provider, provider_event_id: provider_event_id)
  end

  def log_sync(attrs) when is_map(attrs) do
    %SyncLog{}
    |> SyncLog.changeset(attrs)
    |> Repo.insert()
  end

  def list_recent_sync_logs(filters \\ %{}) do
    SyncLog
    |> apply_sync_filters(filters)
    |> order_by([l], desc: l.inserted_at)
    |> maybe_sync_limit(filters)
    |> Repo.all()
  end

  def latest_sync_at(provider, source)
      when provider in [:api_tennis, :goalserve, :betsapi] and is_binary(source) do
    Repo.one(
      from l in SyncLog,
        where: l.provider == ^provider and l.source == ^source,
        order_by: [desc: l.inserted_at],
        limit: 1,
        select: l.inserted_at
    )
  end

  def quarantine_event(attrs, reason, source \\ "unknown") when is_map(attrs) do
    payload = Redactor.redact(attrs)
    diagnostics = build_diagnostics(reason)

    %RejectedEvent{}
    |> RejectedEvent.changeset(%{
      provider: attrs[:provider] || attrs["provider"],
      provider_event_id: attrs[:provider_event_id] || attrs["provider_event_id"],
      source: source,
      reason: diagnostics.reason,
      payload: payload,
      diagnostics: diagnostics.map
    })
    |> Repo.insert()
  end

  def list_rejections(filters \\ %{}) do
    RejectedEvent
    |> apply_rejection_filters(filters)
    |> order_by([r], desc: r.inserted_at)
    |> maybe_limit(filters)
    |> Repo.all()
  end

  def mark_rejection_replayed(%RejectedEvent{} = rejection, status \\ :replayed) do
    attrs = %{
      replay_status: status,
      replayed_at: DateTime.utc_now() |> DateTime.truncate(:second)
    }

    rejection |> RejectedEvent.changeset(attrs) |> Repo.update()
  end

  defp apply_filters(query, filters) do
    Enum.reduce(filters, query, fn
      {:provider, provider}, q when provider in [:api_tennis, :goalserve, :betsapi] ->
        where(q, [e], e.provider == ^provider)

      {"provider", provider}, q when is_binary(provider) ->
        case parse_provider(provider) do
          nil -> q
          parsed -> where(q, [e], e.provider == ^parsed)
        end

      {:sport, sport}, q when sport in [:tennis, :horse_racing, :greyhound] ->
        where(q, [e], e.sport == ^sport)

      {"sport", sport}, q when is_binary(sport) ->
        case parse_sport(sport) do
          nil -> q
          parsed -> where(q, [e], e.sport == ^parsed)
        end

      {:status, status}, q when status in [:scheduled, :live, :finished, :cancelled, :unknown] ->
        where(q, [e], e.status == ^status)

      {"status", status}, q when is_binary(status) ->
        case parse_status(status) do
          nil -> q
          parsed -> where(q, [e], e.status == ^parsed)
        end

      {:from, %DateTime{} = from}, q ->
        where(q, [e], e.start_time_utc >= ^from)

      {"from", from}, q when is_binary(from) ->
        case DateTime.from_iso8601(from) do
          {:ok, dt, _} -> where(q, [e], e.start_time_utc >= ^dt)
          _ -> q
        end

      {:to, %DateTime{} = to}, q ->
        where(q, [e], e.start_time_utc <= ^to)

      {"to", to}, q when is_binary(to) ->
        case DateTime.from_iso8601(to) do
          {:ok, dt, _} -> where(q, [e], e.start_time_utc <= ^dt)
          _ -> q
        end

      _, q ->
        q
    end)
  end

  defp apply_rejection_filters(query, filters) do
    Enum.reduce(filters, query, fn
      {:provider, provider}, q when provider in [:api_tennis, :goalserve, :betsapi] ->
        where(q, [r], r.provider == ^provider)

      {"provider", provider}, q when is_binary(provider) ->
        case parse_provider(provider) do
          nil -> q
          parsed -> where(q, [r], r.provider == ^parsed)
        end

      {:replay_status, status}, q when status in [:pending, :replayed, :failed] ->
        where(q, [r], r.replay_status == ^status)

      {"replay_status", status}, q when is_binary(status) ->
        case parse_replay_status(status) do
          nil -> q
          parsed -> where(q, [r], r.replay_status == ^parsed)
        end

      _, q ->
        q
    end)
  end

  defp maybe_limit(query, filters) do
    case parse_limit(filters[:limit] || filters["limit"]) do
      nil -> query
      limit -> limit(query, ^limit)
    end
  end

  defp apply_sync_filters(query, filters) do
    Enum.reduce(filters, query, fn
      {:provider, provider}, q when provider in [:api_tennis, :goalserve, :betsapi] ->
        where(q, [l], l.provider == ^provider)

      {"provider", provider}, q when is_binary(provider) ->
        case parse_provider(provider) do
          nil -> q
          parsed -> where(q, [l], l.provider == ^parsed)
        end

      {:status, status}, q when status in [:success, :failure, :partial] ->
        where(q, [l], l.status == ^status)

      {"status", status}, q when is_binary(status) ->
        case parse_sync_status(status) do
          nil -> q
          parsed -> where(q, [l], l.status == ^parsed)
        end

      {:source, source}, q when is_binary(source) ->
        where(q, [l], l.source == ^source)

      {"source", source}, q when is_binary(source) ->
        where(q, [l], l.source == ^source)

      _, q ->
        q
    end)
  end

  defp maybe_sync_limit(query, filters) do
    case parse_limit(filters[:limit] || filters["limit"]) do
      nil -> limit(query, 100)
      value -> limit(query, ^value)
    end
  end

  defp parse_limit(nil), do: nil
  defp parse_limit(v) when is_integer(v) and v > 0, do: min(v, 1000)

  defp parse_limit(v) when is_binary(v) do
    case Integer.parse(v) do
      {int, ""} when int > 0 -> min(int, 1000)
      _ -> nil
    end
  end

  defp parse_limit(_), do: nil

  defp parse_provider("api_tennis"), do: :api_tennis
  defp parse_provider("goalserve"), do: :goalserve
  defp parse_provider("betsapi"), do: :betsapi
  defp parse_provider(_), do: nil

  defp parse_sport("tennis"), do: :tennis
  defp parse_sport("horse_racing"), do: :horse_racing
  defp parse_sport("greyhound"), do: :greyhound
  defp parse_sport(_), do: nil

  defp parse_status("scheduled"), do: :scheduled
  defp parse_status("live"), do: :live
  defp parse_status("finished"), do: :finished
  defp parse_status("cancelled"), do: :cancelled
  defp parse_status("unknown"), do: :unknown
  defp parse_status(_), do: nil

  defp parse_sync_status("success"), do: :success
  defp parse_sync_status("failure"), do: :failure
  defp parse_sync_status("partial"), do: :partial
  defp parse_sync_status(_), do: nil

  defp parse_replay_status("pending"), do: :pending
  defp parse_replay_status("replayed"), do: :replayed
  defp parse_replay_status("failed"), do: :failed
  defp parse_replay_status(_), do: nil

  defp format_error(attrs, %Ecto.Changeset{} = changeset) do
    %{
      provider: attrs[:provider] || attrs["provider"],
      provider_event_id: attrs[:provider_event_id] || attrs["provider_event_id"],
      errors: Ecto.Changeset.traverse_errors(changeset, fn {msg, _opts} -> msg end)
    }
  end

  defp format_error(attrs, reason) do
    %{
      provider: attrs[:provider] || attrs["provider"],
      provider_event_id: attrs[:provider_event_id] || attrs["provider_event_id"],
      errors: inspect(reason)
    }
  end

  defp build_diagnostics(%Ecto.Changeset{} = changeset) do
    errors =
      Ecto.Changeset.traverse_errors(changeset, fn {msg, _opts} -> msg end)

    %{
      reason: "validation_error",
      map: %{
        kind: "validation_error",
        errors: errors
      }
    }
  end

  defp build_diagnostics(reason) do
    %{
      reason: inspect(reason),
      map: %{
        kind: "runtime_error",
        reason: inspect(reason)
      }
    }
  end

  defp maybe_clear_rejection(attrs) do
    provider = attrs[:provider] || attrs["provider"]
    provider_event_id = attrs[:provider_event_id] || attrs["provider_event_id"]

    if provider && provider_event_id do
      from(r in RejectedEvent,
        where:
          r.provider == ^provider and r.provider_event_id == ^provider_event_id and
            r.replay_status == :pending
      )
      |> Repo.update_all(set: [replay_status: :replayed, replayed_at: DateTime.utc_now()])
    else
      {0, nil}
    end
  end
end
