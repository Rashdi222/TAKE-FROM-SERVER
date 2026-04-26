defmodule Back.MultiSource.OddsEngine do
  alias Back.MultiSource.Schemas.{CanonicalMatch, CanonicalOddsState}

  @jitter_tolerance_ms 400
  @source_expiration_ms 5_000

  def apply_observations(%CanonicalMatch{} = canonical_match, %{} = envelope) do
    payload = envelope.payload || %{}
    source_name = envelope.source_name
    market_key = extract_market_key(payload)
    observed_at_ms = extract_observed_at_ms(payload, envelope.observed_at_ms)

    if is_binary(source_name) and is_binary(market_key) do
      payload
      |> extract_selection_payloads()
      |> Enum.reduce([], fn selection_payload, acc ->
        case build_observation(
               canonical_match,
               source_name,
               market_key,
               observed_at_ms,
               payload,
               selection_payload
             ) do
          {:ok, observation} -> [observation | acc]
          _ -> acc
        end
      end)
      |> Enum.reverse()
    else
      []
    end
  end

  def stale_snapshot?(%CanonicalOddsState{} = current, incoming_observed_at_ms, source_name)
      when is_integer(incoming_observed_at_ms) and is_binary(source_name) do
    source_watermark =
      current.source_snapshots
      |> Map.get(source_name, %{})
      |> Map.get("observed_at_ms", 0)

    global_watermark = current.high_water_mark_ms || 0

    incoming_observed_at_ms < source_watermark or
      incoming_observed_at_ms < max(global_watermark - @jitter_tolerance_ms, 0)
  end

  def stale_snapshot?(_, _, _), do: false

  def merge_state(nil, %CanonicalOddsState{} = incoming, %CanonicalMatch{} = canonical_match) do
    snapshot = incoming.source_snapshots || %{}

    {status, price, consensus_source, consensus_at, source_count} =
      consensus_for_snapshots(snapshot, canonical_match.anchor_source_name)

    %CanonicalOddsState{
      incoming
      | status: status,
        canonical_price: price,
        last_consensus_source: consensus_source,
        consensus_version: 1,
        high_water_mark_ms: max_snapshot_ms(snapshot),
        payload:
          build_payload(
            incoming.market_key,
            incoming.selection_key,
            status,
            price,
            consensus_source,
            source_count,
            snapshot
          ),
        last_consensus_at: consensus_at
    }
  end

  def merge_state(
        %CanonicalOddsState{} = current,
        %CanonicalOddsState{} = incoming,
        %CanonicalMatch{} = canonical_match
      ) do
    merged_snapshots =
      Map.merge(current.source_snapshots || %{}, incoming.source_snapshots || %{})

    {status, price, consensus_source, consensus_at, source_count} =
      consensus_for_snapshots(merged_snapshots, canonical_match.anchor_source_name)

    %CanonicalOddsState{
      current
      | status: status,
        canonical_price: price,
        last_consensus_source: consensus_source,
        consensus_version:
          max(current.consensus_version || 0, incoming.consensus_version || 0) + 1,
        high_water_mark_ms: max_snapshot_ms(merged_snapshots),
        payload:
          build_payload(
            current.market_key,
            current.selection_key,
            status,
            price,
            consensus_source,
            source_count,
            merged_snapshots
          ),
        source_snapshots: merged_snapshots,
        last_consensus_at: consensus_at || incoming.last_consensus_at || current.last_consensus_at
    }
  end

  def changed?(nil, %CanonicalOddsState{}), do: true

  def changed?(%CanonicalOddsState{} = current, %CanonicalOddsState{} = incoming) do
    Decimal.compare(
      current.canonical_price || Decimal.new("0"),
      incoming.canonical_price || Decimal.new("0")
    ) !=
      :eq or current.status != incoming.status or
      current.last_consensus_source != incoming.last_consensus_source
  end

  def recompute_with_fresh_sources(%CanonicalOddsState{} = state, anchor_source_name, now_ms)
      when is_integer(now_ms) do
    active_cutoff = max(now_ms - source_expiration_ms(), 0)

    fresh_snapshots =
      state.source_snapshots
      |> Enum.filter(fn {_source_name, snapshot} ->
        (snapshot["observed_at_ms"] || 0) >= active_cutoff
      end)
      |> Enum.into(%{})

    {status, price, consensus_source, consensus_at, source_count} =
      consensus_for_snapshots(fresh_snapshots, anchor_source_name)

    %CanonicalOddsState{
      state
      | status: status,
        canonical_price: price,
        last_consensus_source: consensus_source,
        consensus_version: (state.consensus_version || 0) + 1,
        payload:
          build_payload(
            state.market_key,
            state.selection_key,
            status,
            price,
            consensus_source,
            source_count,
            fresh_snapshots
          ),
        source_snapshots: fresh_snapshots,
        high_water_mark_ms: max_snapshot_ms(fresh_snapshots),
        last_consensus_at: consensus_at || state.last_consensus_at
    }
  end

  def active_sources(source_snapshots, now_ms)
      when is_map(source_snapshots) and is_integer(now_ms) do
    active_cutoff = max(now_ms - source_expiration_ms(), 0)

    source_snapshots
    |> Enum.flat_map(fn {source_name, snapshot} ->
      if (snapshot["observed_at_ms"] || 0) >= active_cutoff, do: [source_name], else: []
    end)
    |> Enum.uniq()
  end

  def all_sources(source_snapshots) when is_map(source_snapshots) do
    source_snapshots
    |> Map.keys()
    |> Enum.uniq()
  end

  def source_expiration_ms, do: @source_expiration_ms

  defp build_observation(
         %CanonicalMatch{} = canonical_match,
         source_name,
         market_key,
         observed_at_ms,
         payload,
         selection_payload
       ) do
    with true <- is_binary(market_key),
         true <- is_binary(source_name),
         {:ok, selection_key} <- extract_selection_key(selection_payload),
         {:ok, price} <- extract_price(selection_payload),
         true <- is_integer(observed_at_ms) do
      status =
        normalize_status(
          selection_payload["status"] || selection_payload["market_status"] ||
            payload["market_status"] || payload["status"]
        )

      observed_at = DateTime.from_unix!(observed_at_ms, :millisecond)

      snapshot = %{
        source_name => %{
          "status" => status,
          "price" => Decimal.to_string(price, :normal),
          "observed_at_ms" => observed_at_ms,
          "selection_key" => selection_key,
          "payload" => selection_payload
        }
      }

      {:ok,
       %CanonicalOddsState{
         canonical_match_id: canonical_match.id,
         market_key: market_key,
         selection_key: selection_key,
         status: status,
         canonical_price: price,
         last_consensus_source: source_name,
         consensus_version: 1,
         high_water_mark_ms: observed_at_ms,
         payload:
           build_payload(market_key, selection_key, status, price, source_name, 1, snapshot),
         source_snapshots: snapshot,
         last_consensus_at: observed_at
       }}
    else
      _ -> {:error, :insufficient_selection_identity}
    end
  end

  defp extract_selection_payloads(payload) do
    cond do
      is_list(payload["selections"]) ->
        payload["selections"]

      is_list(payload["outcomes"]) ->
        payload["outcomes"]

      is_map(payload["selection"]) ->
        [payload["selection"]]

      is_binary(payload["selection_key"]) or is_binary(payload["outcome"]) ->
        [payload]

      is_list(get_in(payload, ["market", "selections"])) ->
        get_in(payload, ["market", "selections"])

      true ->
        []
    end
  end

  defp extract_selection_key(payload) do
    case payload["selection_key"] || get_in(payload, ["selection", "key"]) || payload["outcome"] ||
           payload["name"] do
      value when is_binary(value) and value != "" -> {:ok, value}
      value when is_integer(value) -> {:ok, Integer.to_string(value)}
      _ -> {:error, :missing_selection_key}
    end
  end

  defp extract_price(payload) do
    case payload["price"] || payload["odds"] || get_in(payload, ["selection", "price"]) do
      %Decimal{} = value -> {:ok, value}
      value when is_integer(value) -> {:ok, Decimal.new(value)}
      value when is_float(value) -> {:ok, Decimal.from_float(value)}
      value when is_binary(value) and value != "" -> {:ok, Decimal.new(value)}
      _ -> {:error, :missing_price}
    end
  rescue
    _ -> {:error, :invalid_price}
  end

  defp extract_market_key(payload) do
    case payload["market_key"] || get_in(payload, ["market", "key"]) || payload["market"] do
      value when is_binary(value) and value != "" -> value
      value when is_atom(value) -> Atom.to_string(value)
      _ -> nil
    end
  end

  defp extract_observed_at_ms(payload, envelope_observed_at_ms) do
    cond do
      is_integer(payload["observed_at_ms"]) -> payload["observed_at_ms"]
      is_integer(payload["source_event_time_ms"]) -> payload["source_event_time_ms"]
      is_integer(envelope_observed_at_ms) -> envelope_observed_at_ms
      true -> System.system_time(:millisecond)
    end
  end

  defp normalize_status(value) do
    case normalize_text(value) do
      status when status in ["suspended", "pause", "paused", "blocked"] -> "suspended"
      status when status in ["closed", "stopped", "settled", "finished"] -> "closed"
      _ -> "active"
    end
  end

  defp consensus_for_snapshots(source_snapshots, anchor_source_name) do
    max_ms = max_snapshot_ms(source_snapshots)
    fresh_cutoff = max(max_ms - @jitter_tolerance_ms, 0)

    fresh_snapshots =
      source_snapshots
      |> Enum.map(fn {source_name, snapshot} ->
        {source_name, snapshot, normalize_status(snapshot["status"]), snapshot_price(snapshot),
         snapshot["observed_at_ms"] || 0}
      end)
      |> Enum.filter(fn {_source_name, _snapshot, _status, _price, observed_at_ms} ->
        is_integer(observed_at_ms) and observed_at_ms >= fresh_cutoff
      end)

    active_candidates =
      Enum.filter(fresh_snapshots, fn {_source_name, _snapshot, status, price, _observed_at_ms} ->
        status == "active" and not is_nil(price)
      end)

    chosen =
      choose_anchor_candidate(active_candidates, anchor_source_name) ||
        choose_highest_price_candidate(active_candidates)

    status =
      cond do
        chosen != nil ->
          "active"

        Enum.any?(fresh_snapshots, fn {_source_name, _snapshot, status, _price, _observed_at_ms} ->
          status == "suspended"
        end) ->
          "suspended"

        Enum.any?(fresh_snapshots, fn {_source_name, _snapshot, status, _price, _observed_at_ms} ->
          status == "closed"
        end) ->
          "closed"

        true ->
          "active"
      end

    case chosen do
      {source_name, _snapshot, _status, price, observed_at_ms} ->
        {status, price, source_name, DateTime.from_unix!(observed_at_ms, :millisecond),
         length(active_candidates)}

      nil ->
        {status, nil, nil, nil, length(active_candidates)}
    end
  end

  defp choose_anchor_candidate(active_candidates, anchor_source_name)
       when is_binary(anchor_source_name) and anchor_source_name != "" do
    Enum.find(active_candidates, fn {source_name, _snapshot, _status, _price, _observed_at_ms} ->
      source_name == anchor_source_name
    end)
  end

  defp choose_anchor_candidate(_, _), do: nil

  defp choose_highest_price_candidate(active_candidates) do
    Enum.reduce(active_candidates, nil, fn candidate, best ->
      case {candidate, best} do
        {current, nil} ->
          current

        {{_source_name, _snapshot, _status, current_price, current_ms},
         {_best_source_name, _best_snapshot, _best_status, best_price, best_ms} = best_candidate} ->
          case Decimal.compare(current_price, best_price) do
            :gt -> candidate
            :eq when current_ms > best_ms -> candidate
            _ -> best_candidate
          end
      end
    end)
  end

  defp build_payload(
         market_key,
         selection_key,
         status,
         price,
         consensus_source,
         source_count,
         snapshots
       ) do
    %{
      "market_key" => market_key,
      "selection_key" => selection_key,
      "status" => status,
      "price" => if(price, do: Decimal.to_string(price, :normal), else: nil),
      "last_consensus_source" => consensus_source,
      "source_count" => source_count,
      "source_snapshots" => snapshots
    }
  end

  defp max_snapshot_ms(source_snapshots) do
    source_snapshots
    |> Enum.map(fn {_source_name, snapshot} -> snapshot["observed_at_ms"] || 0 end)
    |> Enum.max(fn -> 0 end)
  end

  defp snapshot_price(snapshot) do
    case snapshot["price"] do
      %Decimal{} = value -> value
      value when is_integer(value) -> Decimal.new(value)
      value when is_float(value) -> Decimal.from_float(value)
      value when is_binary(value) and value != "" -> Decimal.new(value)
      _ -> nil
    end
  rescue
    _ -> nil
  end

  defp normalize_text(nil), do: nil

  defp normalize_text(value) when is_binary(value),
    do: value |> String.trim() |> String.downcase()

  defp normalize_text(value), do: value |> to_string() |> String.trim() |> String.downcase()
end
