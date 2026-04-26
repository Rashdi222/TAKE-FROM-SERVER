defmodule Back.SportsData.Redactor do
  @moduledoc false

  @sensitive_keys ~w(api_key apikey key token authorization x-apisports-key)

  def redact(%_{} = term) do
    term
    |> Map.from_struct()
    |> redact()
  end

  def redact(term) when is_map(term) do
    Map.new(term, fn {k, v} ->
      key = to_string(k) |> String.downcase()

      if key in @sensitive_keys do
        {k, "[REDACTED]"}
      else
        {k, redact(v)}
      end
    end)
  end

  def redact(term) when is_list(term), do: Enum.map(term, &redact/1)
  def redact(term), do: term
end
