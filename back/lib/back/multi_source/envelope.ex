defmodule Back.MultiSource.Envelope do
  @enforce_keys [:source_name, :payload]
  defstruct [:source_name, :observed_at_ms, :payload, :message_type]

  def decode(raw_payload) when is_binary(raw_payload) do
    with {:ok, decoded} <- Jason.decode(raw_payload) do
      {:ok,
       %__MODULE__{
         source_name: get_in(decoded, ["source"]),
         observed_at_ms: get_in(decoded, ["observed_at_ms"]),
         payload: get_in(decoded, ["payload"]) || %{},
         message_type: get_in(decoded, ["message_type"])
       }}
    end
  end
end
