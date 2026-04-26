defmodule Back.Live.SimulationScenario do
  @moduledoc false

  @allowed ~w(desperate_chase early_wicket dot_ball_pressure)

  @spec allowed?(String.t()) :: boolean()
  def allowed?(name) when is_binary(name), do: name in @allowed

  @spec load_overlay(String.t()) :: {:ok, map()} | {:error, term()}
  def load_overlay(name) when is_binary(name) do
    if allowed?(name) do
      path = Path.join([:code.priv_dir(:back), "scenarios", "#{name}.json"])

      with {:ok, contents} <- File.read(path),
           {:ok, decoded} when is_map(decoded) <- Jason.decode(contents) do
        {:ok, decoded}
      else
        {:error, reason} -> {:error, reason}
        _ -> {:error, :invalid_scenario_payload}
      end
    else
      {:error, :unknown_scenario}
    end
  end

  @spec merge_overlay(map(), map()) :: map()
  def merge_overlay(base_payload, overlay) when is_map(base_payload) and is_map(overlay) do
    base_payload
    |> stringify_keys()
    |> deep_merge(overlay)
  end

  defp deep_merge(left, right) when is_map(left) and is_map(right) do
    Map.merge(left, right, fn _key, left_value, right_value ->
      deep_merge(left_value, right_value)
    end)
  end

  defp deep_merge(_left, right), do: right

  defp stringify_keys(value) when is_map(value) do
    Map.new(value, fn {key, nested} ->
      {to_string(key), stringify_keys(nested)}
    end)
  end

  defp stringify_keys(value) when is_list(value), do: Enum.map(value, &stringify_keys/1)
  defp stringify_keys(value), do: value
end
