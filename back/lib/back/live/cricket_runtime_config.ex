defmodule Back.Live.CricketRuntimeConfig do
  @moduledoc false

  alias Back.Settings

  @type runtime_config :: %{
          provider: String.t(),
          api_key: String.t() | nil,
          api_key_ref: String.t() | nil,
          model: String.t() | nil,
          fallback_model: String.t() | nil,
          house_margin_profile: String.t(),
          risk_profile: String.t(),
          max_price_jump_threshold: float(),
          request_timeout_ms: non_neg_integer(),
          llm_enabled: boolean(),
          fallback_allowed: boolean(),
          config_provider: String.t()
        }

  @spec resolve() :: runtime_config()
  def resolve do
    api_key = normalize_binary(Settings.get("openrouter_api_key", nil))

    model =
      normalize_binary(Settings.get("openrouter_active_model", nil)) ||
        normalize_binary(Application.get_env(:back, :openrouter_default_model, nil))

    fallback_model =
      normalize_binary(Settings.get("openrouter_fallback_model", nil)) ||
        normalize_binary(Application.get_env(:back, :openrouter_default_model, nil))

    timeout_ms = Application.get_env(:back, :ai_engine_timeout_ms, 2_000)
    llm_enabled = api_key not in [nil, ""] and model not in [nil, ""]

    %{
      provider: "openrouter",
      api_key: api_key,
      api_key_ref: api_key_ref(api_key),
      model: model,
      fallback_model: fallback_model,
      house_margin_profile: "standard",
      risk_profile: "standard",
      max_price_jump_threshold: 0.20,
      request_timeout_ms: timeout_ms,
      llm_enabled: llm_enabled,
      fallback_allowed: true,
      config_provider: "phoenix_settings"
    }
  end

  defp api_key_ref(nil), do: nil

  defp api_key_ref(api_key) when is_binary(api_key) do
    suffix = String.slice(api_key, max(String.length(api_key) - 6, 0), 6)
    "openrouter:****" <> suffix
  end

  defp normalize_binary(nil), do: nil

  defp normalize_binary(value) when is_binary(value) do
    case String.trim(value) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  defp normalize_binary(value), do: to_string(value)
end
