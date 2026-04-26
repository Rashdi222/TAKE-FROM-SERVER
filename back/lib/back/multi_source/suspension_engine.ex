defmodule Back.MultiSource.SuspensionEngine do
  alias Back.MultiSource.Schemas.CanonicalMarketState

  def apply_observation(%{} = canonical_match, %{} = envelope) do
    source_name = envelope.source_name
    payload = envelope.payload || %{}
    market_key = extract_market_key(payload)
    source_match_id = extract_source_match_id(payload)
    market_status = normalize_status(payload)
    suspension_reason = extract_suspension_reason(payload)
    observed_at = from_observed_at(envelope.observed_at_ms)

    with true <- is_binary(source_name),
         true <- is_binary(source_match_id),
         true <- is_binary(market_key) do
      state = %CanonicalMarketState{
        canonical_match_id: canonical_match.id,
        market_key: market_key,
        status: if(market_status == "suspended", do: "suspended", else: "active"),
        suspension_reason: if(market_status == "suspended", do: suspension_reason, else: nil),
        suspension_sources: if(market_status == "suspended", do: [source_name], else: []),
        last_consensus_source: source_name,
        consensus_version: 1,
        payload: canonical_payload(payload, market_status),
        source_snapshots: %{
          source_name => %{
            "status" => market_status,
            "observed_at_ms" => envelope.observed_at_ms,
            "payload" => payload
          }
        },
        last_consensus_at: observed_at
      }

      {:ok, {:market_observation, state}}
    else
      _ -> {:error, :insufficient_market_identity}
    end
  end

  def merge_state(%CanonicalMarketState{} = current, %CanonicalMarketState{} = incoming) do
    incoming_snapshot =
      Map.merge(current.source_snapshots || %{}, incoming.source_snapshots || %{})

    snapshot_statuses =
      incoming_snapshot
      |> Enum.map(fn {_source, snapshot} -> normalize_text(snapshot["status"]) || "active" end)

    suspension_sources =
      incoming_snapshot
      |> Enum.flat_map(fn {source, snapshot} ->
        case normalize_text(snapshot["status"]) do
          "suspended" -> [source]
          _ -> []
        end
      end)
      |> Enum.uniq()

    status =
      cond do
        Enum.any?(snapshot_statuses, &(&1 == "suspended")) -> "suspended"
        Enum.any?(snapshot_statuses, &(&1 == "active")) -> "active"
        Enum.any?(snapshot_statuses, &(&1 == "closed")) -> "closed"
        true -> incoming.status || current.status || "active"
      end

    reason =
      cond do
        status != "suspended" -> nil
        present?(incoming.suspension_reason) -> incoming.suspension_reason
        present?(current.suspension_reason) -> current.suspension_reason
        true -> "suspension_first"
      end

    %{
      current
      | status: status,
        suspension_reason: reason,
        suspension_sources: suspension_sources,
        last_consensus_source: incoming.last_consensus_source || current.last_consensus_source,
        consensus_version:
          max(current.consensus_version || 0, incoming.consensus_version || 0) + 1,
        payload: merge_payload(current.payload || %{}, incoming.payload || %{}, status, reason),
        source_snapshots: incoming_snapshot,
        last_consensus_at: incoming.last_consensus_at || current.last_consensus_at
    }
  end

  defp extract_source_match_id(payload) do
    payload["source_match_id"] || payload["match_id"] || payload["fixture_id"] ||
      payload["event_id"]
  end

  defp extract_market_key(payload) do
    payload["market_key"] || get_in(payload, ["market", "key"]) || payload["market"]
  end

  defp normalize_status(payload) do
    value =
      payload["market_status"] || payload["status"] || get_in(payload, ["market", "status"]) ||
        get_in(payload, ["state", "status"])

    case normalize_text(value) do
      status when status in ["suspended", "pause", "paused", "blocked"] -> "suspended"
      status when status in ["closed", "stopped", "settled", "finished"] -> "closed"
      _ -> "active"
    end
  end

  defp extract_suspension_reason(payload) do
    reason =
      payload["suspension_reason"] || payload["reason"] || get_in(payload, ["market", "reason"])

    case normalize_text(reason) do
      nil -> "suspension_first"
      normalized -> normalized
    end
  end

  defp canonical_payload(payload, status) do
    %{
      "market_key" => extract_market_key(payload),
      "status" => status,
      "source_match_id" => extract_source_match_id(payload),
      "selection_key" => payload["selection_key"] || get_in(payload, ["selection", "key"]),
      "price" => payload["price"] || payload["odds"] || get_in(payload, ["selection", "price"]),
      "raw" => payload
    }
  end

  defp merge_payload(current, incoming, status, reason) do
    current
    |> Map.merge(incoming)
    |> Map.put("status", status)
    |> Map.put("suspension_reason", reason)
  end

  defp normalize_text(nil), do: nil

  defp normalize_text(value) when is_binary(value),
    do: value |> String.trim() |> String.downcase()

  defp normalize_text(value), do: value |> to_string() |> String.trim() |> String.downcase()

  defp from_observed_at(ms) when is_integer(ms) do
    DateTime.from_unix!(ms, :millisecond)
  rescue
    _ -> DateTime.utc_now()
  end

  defp from_observed_at(_), do: DateTime.utc_now()

  defp present?(value), do: is_binary(value) and String.trim(value) != ""
end
