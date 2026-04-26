defmodule Back.Providers.ApiSportsLiveOddsIndex do
  @moduledoc false

  use GenServer

  import Ecto.Query

  require Logger

  alias Back.Betting.Match
  alias Back.Providers
  alias Back.Providers.CompetitionFeed
  alias Back.Providers.Provider
  alias Back.Providers.ApiSports
  alias Back.Providers.CacheMirror
  alias Back.Repo

  @table :api_sports_live_odds_index
  @meta_key :"$meta"
  @redis_fixture_prefix "provider_cache:api_sports_live_odds:fixture:"
  @redis_meta_key "provider_cache:api_sports_live_odds:meta"
  @default_refresh_interval_ms 15_000
  @default_ttl_ms 30_000
  @default_stale_grace_ms 300_000
  @meta_ttl_ms 6 * 60 * 60 * 1000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, Keyword.put_new(opts, :name, __MODULE__))
  end

  def refresh_now do
    GenServer.call(__MODULE__, :refresh_now, 30_000)
  end

  def request_refresh_async do
    GenServer.cast(__MODULE__, :refresh_async)
  end

  def get(fixture_id) when is_binary(fixture_id) do
    get(fixture_id, allow_stale?: false)
  end

  def get(fixture_id, opts) when is_binary(fixture_id) and is_list(opts) do
    ensure_table()
    now_ms = System.system_time(:millisecond)
    allow_stale? = Keyword.get(opts, :allow_stale?, false)

    stale_grace_ms =
      Keyword.get(
        opts,
        :stale_grace_ms,
        Application.get_env(
          :back,
          :api_sports_live_odds_index_stale_grace_ms,
          @default_stale_grace_ms
        )
      )

    case :ets.lookup(@table, fixture_id) do
      [{^fixture_id, entry, expires_at_ms}] when expires_at_ms > now_ms ->
        entry

      [{^fixture_id, entry, expires_at_ms}]
      when allow_stale? and expires_at_ms + stale_grace_ms > now_ms ->
        entry

      [{^fixture_id, _entry, _expires_at_ms}] ->
        restore_from_redis(fixture_id, now_ms, allow_stale?, stale_grace_ms)

      _ ->
        restore_from_redis(fixture_id, now_ms, allow_stale?, stale_grace_ms)
    end
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

    fixture_ids =
      from(m in Match,
        where:
          m.competition_feed_id == ^feed.id and m.provider == "api_sports" and
            m.sport == :football and
            m.status == :live,
        select: m.external_id
      )
      |> Repo.all()
      |> Enum.reject(&is_nil/1)

    meta = current_meta()

    %{
      active_fixture_count: Enum.count(fixture_ids, &(get(&1) != nil)),
      last_refresh_at: meta[:last_refresh_at],
      last_successful_refresh_at: meta[:last_successful_refresh_at],
      stale?: stale_meta?(meta)
    }
  end

  def refresh_once(fetcher \\ &default_fetch/0, opts \\ []) when is_function(fetcher, 0) do
    ensure_table()

    now_ms = Keyword.get(opts, :now_ms, System.system_time(:millisecond))
    now = DateTime.from_unix!(div(now_ms, 1_000), :second)

    ttl_ms =
      Keyword.get(
        opts,
        :ttl_ms,
        Application.get_env(:back, :api_sports_live_odds_index_ttl_ms, @default_ttl_ms)
      )

    put_meta(%{last_refresh_at: DateTime.to_iso8601(now), ttl_ms: ttl_ms})

    with {:ok, %Provider{} = provider, rows} <- fetcher.() do
      entries =
        rows
        |> Enum.reduce(%{}, fn row, acc ->
          case normalize_entry(row, now) do
            {:ok, fixture_id, entry} ->
              Map.update(acc, fixture_id, entry, fn existing ->
                %{
                  existing
                  | rows: existing.rows ++ entry.rows,
                    discovered_at: entry.discovered_at,
                    league_id: entry.league_id || existing.league_id
                }
              end)

            :skip ->
              acc
          end
        end)

      store_entries(entries, now_ms + ttl_ms, ttl_ms)

      put_meta(%{
        provider_id: provider.id,
        last_successful_refresh_at: DateTime.to_iso8601(now),
        last_error: nil,
        fetched_market_count: length(rows),
        indexed_fixture_count: map_size(entries),
        ttl_ms: ttl_ms
      })

      _ =
        Providers.log_sync_result(%{
          provider_id: provider.id,
          sync_type: "scheduled",
          status: :success,
          duration_ms: Keyword.get(opts, :duration_ms, 0),
          metadata: %{
            "kind" => "live_batch_odds_discovery",
            "source" => "api_sports_live_odds",
            "fetched_market_count" => length(rows),
            "indexed_fixture_count" => map_size(entries),
            "ttl_ms" => ttl_ms
          }
        })

      Logger.info(
        "[API_SPORTS_LIVE_ODDS_INDEX] refreshed fixtures=#{map_size(entries)} markets=#{length(rows)} ttl_ms=#{ttl_ms}"
      )

      if length(rows) > 0 and map_size(entries) == 0 do
        Logger.warning(
          "[API_SPORTS_LIVE_ODDS_INDEX] fetched live odds markets but indexed zero fixtures; check provider payload shape"
        )
      end

      {:ok,
       %{
         provider_id: provider.id,
         fetched_market_count: length(rows),
         indexed_fixture_count: map_size(entries)
       }}
    else
      {:error, reason} = error ->
        put_meta(%{last_error: inspect(reason)})

        if reason not in [:provider_not_found, :no_enabled_football_odds_feed] do
          Logger.warning("[API_SPORTS_LIVE_ODDS_INDEX] refresh failed #{inspect(reason)}")
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
            :api_sports_live_odds_index_refresh_interval_ms,
            @default_refresh_interval_ms
          )
        ),
      min_async_refresh_interval_ms:
        Keyword.get(
          opts,
          :min_async_refresh_interval_ms,
          Application.get_env(
            :back,
            :api_sports_live_odds_index_min_async_refresh_interval_ms,
            5_000
          )
        ),
      last_async_refresh_at_ms: 0
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
      {:error, :no_enabled_football_odds_feed} -> :ok
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

  @impl true
  def handle_cast(:refresh_async, state) do
    now_ms = System.system_time(:millisecond)

    if now_ms - state.last_async_refresh_at_ms >= state.min_async_refresh_interval_ms do
      started = System.monotonic_time(:millisecond)
      _ = refresh_once(&default_fetch/0, duration_ms: 0)
      duration_ms = System.monotonic_time(:millisecond) - started
      put_meta(%{last_duration_ms: duration_ms})
      {:noreply, %{state | last_async_refresh_at_ms: now_ms}}
    else
      {:noreply, state}
    end
  end

  defp default_fetch do
    with {:ok, providers} <- api_sports_providers_for_enabled_odds_feeds(),
         {:ok, provider, rows} <- fetch_first_live_odds_batch(providers) do
      {:ok, provider, rows}
    end
  end

  defp api_sports_providers_for_enabled_odds_feeds do
    providers =
      Repo.all(
        from p in Provider,
          join: f in CompetitionFeed,
          on: f.provider_id == p.id,
          where:
            p.name == "api_sports" and p.is_enabled == true and f.enabled == true and
              f.live_sync_enabled == true and f.sport == "football" and
              (f.import_provider_odds == true or f.generate_platform_odds == true),
          order_by: [desc: p.is_active, desc: p.updated_at, desc: p.inserted_at],
          distinct: p.id
      )

    case providers do
      [] -> {:error, :no_enabled_football_odds_feed}
      rows -> {:ok, rows}
    end
  end

  defp fetch_first_live_odds_batch(providers) when is_list(providers) do
    Enum.reduce_while(providers, {:error, :live_odds_batch_unavailable}, fn provider, _acc ->
      case ApiSports.fetch_live_odds_batch(Providers.provider_adapter_config(provider)) do
        {:ok, rows} when is_list(rows) and rows != [] ->
          {:halt, {:ok, provider, rows}}

        {:ok, _rows} ->
          {:cont, {:error, :live_odds_batch_unavailable}}

        {:error, reason} ->
          Logger.warning(
            "[API_SPORTS_LIVE_ODDS_INDEX] provider=#{provider.id} batch fetch failed #{inspect(reason)}"
          )

          {:cont, {:error, reason}}
      end
    end)
    |> case do
      {:ok, provider, rows} -> {:ok, provider, rows}
      _ -> {:error, :live_odds_batch_unavailable}
    end
  end

  defp normalize_entry(row, now) when is_map(row) do
    fixture_id =
      normalize_fixture_id(
        row["fixture_id"] ||
          get_in(row, ["fixture", "id"]) ||
          get_in(row, ["fixture", "fixture_id"]) ||
          row["id"]
      )

    normalized_rows = ApiSports.normalize_odds_rows([row])

    if fixture_id != "" and normalized_rows != [] do
      {:ok, fixture_id,
       %{
         fixture_id: fixture_id,
         rows: normalized_rows,
         discovered_at: DateTime.to_iso8601(now),
         league_id:
           row["league_id"] ||
             get_in(row, ["league", "id"]) ||
             get_in(row, ["fixture", "league", "id"]),
         source: "api_sports_live_odds"
       }}
    else
      :skip
    end
  end

  defp normalize_entry(_, _), do: :skip

  defp normalize_fixture_id(nil), do: ""
  defp normalize_fixture_id(value) when is_binary(value), do: String.trim(value)
  defp normalize_fixture_id(value) when is_integer(value), do: Integer.to_string(value)
  defp normalize_fixture_id(value), do: to_string(value)

  defp store_entries(entries, expires_at_ms, ttl_ms) do
    purge_expired(System.system_time(:millisecond))

    Enum.each(entries, fn {fixture_id, entry} ->
      :ets.insert(@table, {fixture_id, entry, expires_at_ms})
    end)

    redis_entries =
      Enum.map(entries, fn {fixture_id, entry} ->
        {
          redis_fixture_key(fixture_id),
          %{"entry" => entry, "expires_at_ms" => expires_at_ms},
          redis_cache_ttl_ms(ttl_ms)
        }
      end)

    _ = CacheMirror.put_many_json(redis_entries)
  end

  defp purge_expired(now_ms) do
    ensure_table()

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

  defp active_fixture_count do
    :ets.tab2list(@table)
    |> Enum.count(fn
      {@meta_key, _meta} -> false
      {_fixture_id, _entry, _expires_at_ms} -> true
      _ -> false
    end)
  end

  defp stale_meta?(meta) do
    ttl_ms = meta[:ttl_ms] || @default_ttl_ms

    case meta[:last_successful_refresh_at] do
      nil ->
        true

      value ->
        with {:ok, ts, _offset} <- DateTime.from_iso8601(value) do
          System.system_time(:millisecond) - DateTime.to_unix(ts, :millisecond) > ttl_ms
        else
          _ -> true
        end
    end
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

  defp ensure_table do
    case :ets.whereis(@table) do
      :undefined -> :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])
      _ -> @table
    end
  end

  defp restore_from_redis(fixture_id, now_ms, allow_stale?, stale_grace_ms) do
    case CacheMirror.get_json(redis_fixture_key(fixture_id)) do
      {:ok, %{"entry" => entry, "expires_at_ms" => expires_at_ms}}
      when is_map(entry) and is_integer(expires_at_ms) and expires_at_ms > now_ms ->
        :ets.insert(@table, {fixture_id, entry, expires_at_ms})
        entry

      {:ok, %{"entry" => entry, "expires_at_ms" => expires_at_ms}}
      when is_map(entry) and is_float(expires_at_ms) and trunc(expires_at_ms) > now_ms ->
        restored_expiry = trunc(expires_at_ms)
        :ets.insert(@table, {fixture_id, entry, restored_expiry})
        entry

      {:ok, %{"entry" => entry, "expires_at_ms" => expires_at_ms}}
      when is_map(entry) and is_integer(expires_at_ms) and allow_stale? and
             expires_at_ms + stale_grace_ms > now_ms ->
        entry

      {:ok, %{"entry" => entry, "expires_at_ms" => expires_at_ms}}
      when is_map(entry) and is_float(expires_at_ms) and allow_stale? and
             trunc(expires_at_ms) + stale_grace_ms > now_ms ->
        entry

      _ ->
        nil
    end
  end

  defp redis_fixture_key(fixture_id), do: @redis_fixture_prefix <> fixture_id

  defp redis_cache_ttl_ms(ttl_ms) when is_integer(ttl_ms) and ttl_ms > 0 do
    stale_grace_ms =
      Application.get_env(
        :back,
        :api_sports_live_odds_index_stale_grace_ms,
        @default_stale_grace_ms
      )

    ttl_ms + stale_grace_ms
  end

  defp normalize_meta_keys(meta) when is_map(meta) do
    Enum.reduce(meta, %{}, fn
      {key, value}, acc when is_atom(key) ->
        Map.put(acc, key, value)

      {key, value}, acc when is_binary(key) ->
        atom_key =
          case key do
            "active_fixture_count" -> :active_fixture_count
            "fetched_market_count" -> :fetched_market_count
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
end
