defmodule Back.Providers.SportmonksLiveIndex do
  @moduledoc false

  use GenServer

  import Ecto.Query

  require Logger

  alias Back.Providers
  alias Back.Providers.CompetitionFeed
  alias Back.Providers.Provider
  alias Back.Providers.CacheMirror
  alias Back.Providers.Sportmonks
  alias Back.Repo

  @table :sportmonks_live_index
  @meta_key :"$meta"
  @redis_fixture_prefix "provider_cache:sportmonks_live_index:fixture:"
  @redis_meta_key "provider_cache:sportmonks_live_index:meta"
  @default_refresh_interval_ms 5_000
  @default_ttl_ms 45_000
  @meta_ttl_ms 6 * 60 * 60 * 1000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, Keyword.put_new(opts, :name, __MODULE__))
  end

  def refresh_now do
    GenServer.call(__MODULE__, :refresh_now, 30_000)
  end

  def summary do
    ensure_table()
    purge_expired(System.system_time(:millisecond))

    meta = current_meta()

    Map.merge(
      %{
        active_fixture_count: active_fixture_count(),
        last_refresh_at: nil,
        last_successful_refresh_at: nil,
        last_error: nil,
        provider_id: nil,
        ttl_ms: @default_ttl_ms,
        stale?: true
      },
      meta
      |> Map.put(:active_fixture_count, active_fixture_count())
      |> Map.put(:stale?, stale_meta?(meta))
    )
  end

  def summary_for_feed(%CompetitionFeed{} = feed) do
    ensure_table()
    purge_expired(System.system_time(:millisecond))

    matches_feed? = fn entry ->
      league_id = entry_value(entry, :league_id)
      season_id = entry_value(entry, :season_id)

      (present?(feed.league_id) and league_id == to_string(feed.league_id)) or
        (present?(feed.season_id) and season_id == to_string(feed.season_id))
    end

    meta = current_meta()

    %{
      active_fixture_count: Enum.count(active_entries(), matches_feed?),
      last_refresh_at: meta[:last_refresh_at],
      last_successful_refresh_at: meta[:last_successful_refresh_at],
      stale?: stale_meta?(meta)
    }
  end

  def fresh_fixture?(fixture_id) when is_binary(fixture_id) do
    case get(fixture_id) do
      %{} -> true
      _ -> false
    end
  end

  def get(fixture_id) when is_binary(fixture_id) do
    ensure_table()
    now_ms = System.system_time(:millisecond)

    case :ets.lookup(@table, fixture_id) do
      [{^fixture_id, entry, expires_at_ms}] when expires_at_ms > now_ms ->
        entry

      [{^fixture_id, _entry, _expires_at_ms}] ->
        :ets.delete(@table, fixture_id)
        restore_from_redis(fixture_id, now_ms)

      _ ->
        restore_from_redis(fixture_id, now_ms)
    end
  end

  def refresh_once(fetcher \\ &default_fetch/0, opts \\ []) when is_function(fetcher, 0) do
    ensure_table()

    now_ms = Keyword.get(opts, :now_ms, System.system_time(:millisecond))
    now = DateTime.from_unix!(div(now_ms, 1_000), :second)

    ttl_ms =
      Keyword.get(
        opts,
        :ttl_ms,
        Application.get_env(:back, :sportmonks_live_index_ttl_ms, @default_ttl_ms)
      )

    put_meta(%{last_refresh_at: DateTime.to_iso8601(now), ttl_ms: ttl_ms})

    with {:ok, %Provider{} = provider, rows} <- fetcher.() do
      entries =
        rows
        |> Enum.reduce(%{}, fn row, acc ->
          case normalize_entry(row, now) do
            {:ok, entry} ->
              case entry_value(entry, :fixture_id) do
                fixture_id when is_binary(fixture_id) and fixture_id != "" ->
                  Map.put(acc, fixture_id, entry)

                fixture_id when is_integer(fixture_id) ->
                  Map.put(acc, to_string(fixture_id), entry)

                _ ->
                  acc
              end

            :skip ->
              acc
          end
        end)
        |> Map.values()

      store_entries(entries, now_ms + ttl_ms, ttl_ms)

      put_meta(%{
        provider_id: provider.id,
        last_successful_refresh_at: DateTime.to_iso8601(now),
        last_error: nil,
        fetched_fixture_count: length(rows),
        indexed_fixture_count: length(entries),
        ttl_ms: ttl_ms
      })

      _ =
        Providers.log_sync_result(%{
          provider_id: provider.id,
          sync_type: "scheduled",
          status: :success,
          duration_ms: Keyword.get(opts, :duration_ms, 0),
          metadata: %{
            "kind" => "live_batch_discovery",
            "source" => "sportmonks_livescores",
            "fetched_fixture_count" => length(rows),
            "indexed_fixture_count" => length(entries),
            "ttl_ms" => ttl_ms
          }
        })

      Logger.info(
        "[SPORTMONKS_LIVE_INDEX] refreshed fixtures=#{length(entries)} fetched=#{length(rows)} ttl_ms=#{ttl_ms}"
      )

      {:ok,
       %{
         provider_id: provider.id,
         fetched_fixture_count: length(rows),
         indexed_fixture_count: length(entries)
       }}
    else
      {:error, reason} = error ->
        put_meta(%{last_error: inspect(reason)})

        if reason not in [:provider_not_found, :no_enabled_cricket_feed] do
          Logger.warning("[SPORTMONKS_LIVE_INDEX] refresh failed #{inspect(reason)}")
        end

        error
    end
  end

  @impl true
  def init(opts) do
    ensure_table()

    state = %{
      refresh_interval_ms:
        Keyword.get(
          opts,
          :refresh_interval_ms,
          Application.get_env(
            :back,
            :sportmonks_live_index_refresh_interval_ms,
            @default_refresh_interval_ms
          )
        )
    }

    Process.send_after(self(), :refresh, 0)
    {:ok, state}
  end

  @impl true
  def handle_info(:refresh, state) do
    started = System.monotonic_time(:millisecond)
    result = refresh_once(&default_fetch/0, duration_ms: 0)
    duration_ms = System.monotonic_time(:millisecond) - started
    put_meta(%{last_duration_ms: duration_ms})

    case result do
      {:ok, _} -> :ok
      {:error, :no_enabled_cricket_feed} -> :ok
      {:error, :provider_not_found} -> :ok
      {:error, _reason} -> :ok
    end

    Process.send_after(self(), :refresh, state.refresh_interval_ms)
    {:noreply, state}
  end

  @impl true
  def handle_call(:refresh_now, _from, state) do
    started = System.monotonic_time(:millisecond)
    result = refresh_once(&default_fetch/0, duration_ms: 0)
    duration_ms = System.monotonic_time(:millisecond) - started
    put_meta(%{last_duration_ms: duration_ms})
    {:reply, result, state}
  end

  defp default_fetch do
    with {:ok, provider} <- Providers.get_enabled_provider_by_name("sportmonks"),
         true <-
           sportmonks_cricket_feed_enabled?(provider.id) || {:error, :no_enabled_cricket_feed},
         {:ok, rows} <- Sportmonks.fetch_live(Providers.provider_adapter_config(provider)) do
      {:ok, provider, rows}
    end
  end

  defp sportmonks_cricket_feed_enabled?(provider_id) do
    Repo.exists?(
      from f in CompetitionFeed,
        where: f.provider_id == ^provider_id and f.enabled == true and f.sport == "cricket"
    )
  end

  defp normalize_entry(row, now) when is_map(row) do
    fixture_id = row["id"] || row[:id] || row["fixture_id"] || row[:fixture_id]

    if present?(fixture_id) do
      normalized = Sportmonks.normalize(row)
      raw = normalized[:raw] || %{}

      {:ok,
       %{
         fixture_id: to_string(fixture_id),
         league_id:
           stringify(row["league_id"] || get_in(row, ["league", "id"]) || raw["league_id"]),
         season_id:
           stringify(row["season_id"] || get_in(row, ["season", "id"]) || raw["season_id"]),
         status: to_string(normalized[:status] || "upcoming"),
         starts_at: stringify(normalized[:start_time]),
         current_innings: normalized[:current_innings],
         current_over: normalized[:current_over],
         current_ball_in_over: normalized[:current_ball_in_over],
         runs_total: normalized[:runs_total],
         wickets_total: normalized[:wickets_total],
         batting_team: stringify(normalized[:batting_team]),
         bowling_team: stringify(normalized[:bowling_team]),
         last_ball_event_type: stringify(normalized[:last_ball_event_type]),
         discovered_at: DateTime.to_iso8601(now),
         provider_updated_at:
           stringify(
             row["updated_at"] || row[:updated_at] || get_in(row, ["fixture", "updated_at"])
           ),
         source: "sportmonks_livescores"
       }}
    else
      :skip
    end
  end

  defp normalize_entry(_row, _now), do: :skip

  defp ensure_table do
    case :ets.whereis(@table) do
      :undefined -> :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])
      _ -> @table
    end
  end

  defp store_entries(entries, expires_at_ms, ttl_ms) do
    now_ms = System.system_time(:millisecond)
    purge_expired(now_ms)

    current_ids =
      active_entries()
      |> Enum.map(&entry_value(&1, :fixture_id))
      |> Enum.reject(&is_nil/1)
      |> MapSet.new()

    next_ids =
      entries |> Enum.map(&entry_value(&1, :fixture_id)) |> Enum.reject(&is_nil/1) |> MapSet.new()

    MapSet.difference(current_ids, next_ids)
    |> Enum.each(&:ets.delete(@table, &1))

    Enum.each(entries, fn entry ->
      fixture_id = entry_value(entry, :fixture_id)

      if present?(fixture_id) do
        :ets.insert(@table, {to_string(fixture_id), entry, expires_at_ms})
      end
    end)

    redis_entries =
      Enum.flat_map(entries, fn entry ->
        fixture_id = entry_value(entry, :fixture_id)

        if present?(fixture_id) do
          [
            {
              redis_fixture_key(to_string(fixture_id)),
              %{"entry" => entry, "expires_at_ms" => expires_at_ms},
              ttl_ms
            }
          ]
        else
          []
        end
      end)

    _ = CacheMirror.put_many_json(redis_entries)
  end

  defp active_fixture_count, do: length(active_entries())

  defp active_entries do
    now_ms = System.system_time(:millisecond)

    :ets.tab2list(@table)
    |> Enum.flat_map(fn
      {@meta_key, _meta} ->
        []

      {fixture_id, entry, expires_at_ms} when is_binary(fixture_id) and expires_at_ms > now_ms ->
        [entry]

      _ ->
        []
    end)
  end

  defp purge_expired(now_ms) do
    :ets.tab2list(@table)
    |> Enum.each(fn
      {@meta_key, _meta} ->
        :ok

      {fixture_id, _entry, expires_at_ms} when expires_at_ms <= now_ms ->
        :ets.delete(@table, fixture_id)

      _ ->
        :ok
    end)
  end

  defp current_meta do
    case :ets.lookup(@table, @meta_key) do
      [{@meta_key, meta}] when is_map(meta) ->
        normalize_meta_keys(meta)

      _ ->
        case CacheMirror.get_json(@redis_meta_key) do
          {:ok, meta} when is_map(meta) ->
            normalized = normalize_meta_keys(meta)
            :ets.insert(@table, {@meta_key, normalized})
            normalized

          _ ->
            %{}
        end
    end
  end

  defp put_meta(attrs) when is_map(attrs) do
    meta = Map.merge(current_meta(), attrs)
    :ets.insert(@table, {@meta_key, meta})
    _ = CacheMirror.put_json(@redis_meta_key, meta, @meta_ttl_ms)
    meta
  end

  defp stale_meta?(meta) do
    ttl_ms = meta[:ttl_ms] || @default_ttl_ms

    with timestamp when is_binary(timestamp) <- meta[:last_successful_refresh_at],
         {:ok, dt, _offset} <- DateTime.from_iso8601(timestamp) do
      System.system_time(:millisecond) - DateTime.to_unix(dt, :millisecond) > ttl_ms
    else
      _ -> true
    end
  end

  defp present?(value) when is_binary(value), do: String.trim(value) != ""
  defp present?(value) when is_integer(value), do: true
  defp present?(_), do: false

  defp stringify(nil), do: nil
  defp stringify(%DateTime{} = value), do: DateTime.to_iso8601(value)
  defp stringify(%NaiveDateTime{} = value), do: NaiveDateTime.to_iso8601(value)
  defp stringify(value) when is_binary(value), do: value
  defp stringify(value), do: to_string(value)

  defp restore_from_redis(fixture_id, now_ms) do
    case CacheMirror.get_json(redis_fixture_key(fixture_id)) do
      {:ok, %{"entry" => entry, "expires_at_ms" => expires_at_ms}}
      when is_map(entry) and is_integer(expires_at_ms) and expires_at_ms > now_ms ->
        normalized = normalize_cached_entry(entry)
        :ets.insert(@table, {fixture_id, normalized, expires_at_ms})
        normalized

      {:ok, %{"entry" => entry, "expires_at_ms" => expires_at_ms}}
      when is_map(entry) and is_float(expires_at_ms) and trunc(expires_at_ms) > now_ms ->
        restored_expiry = trunc(expires_at_ms)
        normalized = normalize_cached_entry(entry)
        :ets.insert(@table, {fixture_id, normalized, restored_expiry})
        normalized

      _ ->
        nil
    end
  end

  defp redis_fixture_key(fixture_id), do: @redis_fixture_prefix <> fixture_id

  defp normalize_meta_keys(meta) when is_map(meta) do
    Enum.reduce(meta, %{}, fn
      {key, value}, acc when is_atom(key) ->
        Map.put(acc, key, value)

      {key, value}, acc when is_binary(key) ->
        atom_key =
          case key do
            "active_fixture_count" -> :active_fixture_count
            "fetched_fixture_count" -> :fetched_fixture_count
            "indexed_fixture_count" -> :indexed_fixture_count
            "last_duration_ms" -> :last_duration_ms
            "last_error" -> :last_error
            "last_refresh_at" -> :last_refresh_at
            "last_successful_refresh_at" -> :last_successful_refresh_at
            "provider_id" -> :provider_id
            "ttl_ms" -> :ttl_ms
            _ -> nil
          end

        if atom_key, do: Map.put(acc, atom_key, value), else: acc
    end)
  end

  defp normalize_cached_entry(entry) when is_map(entry) do
    %{
      fixture_id: stringify(entry_value(entry, :fixture_id)),
      league_id: stringify(entry_value(entry, :league_id)),
      season_id: stringify(entry_value(entry, :season_id)),
      status: stringify(entry_value(entry, :status)),
      starts_at: stringify(entry_value(entry, :starts_at)),
      current_innings: entry_value(entry, :current_innings),
      current_over: entry_value(entry, :current_over),
      current_ball_in_over: entry_value(entry, :current_ball_in_over),
      runs_total: entry_value(entry, :runs_total),
      wickets_total: entry_value(entry, :wickets_total),
      batting_team: stringify(entry_value(entry, :batting_team)),
      bowling_team: stringify(entry_value(entry, :bowling_team)),
      last_ball_event_type: stringify(entry_value(entry, :last_ball_event_type)),
      discovered_at: stringify(entry_value(entry, :discovered_at)),
      provider_updated_at: stringify(entry_value(entry, :provider_updated_at)),
      source: stringify(entry_value(entry, :source))
    }
  end

  defp normalize_cached_entry(_), do: %{}

  defp entry_value(entry, key) when is_map(entry) and is_atom(key) do
    Map.get(entry, key) || Map.get(entry, Atom.to_string(key))
  end
end
