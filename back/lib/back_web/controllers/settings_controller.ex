defmodule BackWeb.SettingsController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Accounts
  alias Back.AI.ModelCache
  alias Back.Settings

  @landing_whatsapp_key "landing_whatsapp_contact"

  def account_currencies(conn, _params) do
    json(conn, %{data: Accounts.list_enabled_account_currencies()})
  end

  def landing_whatsapp_contact(conn, _params) do
    json(conn, %{data: landing_whatsapp_payload()})
  end

  def admin_account_currencies(conn, _params) do
    json(conn, %{data: Accounts.list_account_currencies()})
  end

  def update_account_currencies(conn, %{"enabled_codes" => enabled_codes})
      when is_list(enabled_codes) do
    with {:ok, _} <- Accounts.update_enabled_account_currencies(enabled_codes) do
      json(conn, %{data: Accounts.list_account_currencies()})
    end
  end

  # GET /api/super-admin/settings/openrouter/models
  def openrouter_models(conn, params) do
    force_refresh = params["refresh"] in ["1", "true", true]

    with {:ok, models} <- ModelCache.list_models(force_refresh: force_refresh) do
      json(conn, %{data: models, cached_at: Settings.get("openrouter_models_cached_at")})
    end
  end

  # GET /api/super-admin/settings/openrouter
  def openrouter_settings(conn, _params) do
    json(conn, %{
      data: %{
        openrouter_active_model: Settings.get("openrouter_active_model"),
        openrouter_api_key_configured:
          is_binary(Settings.get("openrouter_api_key")) and
            String.trim(Settings.get("openrouter_api_key")) != ""
      }
    })
  end

  # POST /api/super-admin/settings/openrouter/model
  def set_openrouter_model(conn, %{"model" => model}) do
    with true <- is_binary(model) and String.trim(model) != "",
         {:ok, _} <- Settings.put("openrouter_active_model", model) do
      json(conn, %{data: %{openrouter_active_model: model}})
    else
      false -> {:error, :invalid_model}
    end
  end

  # POST /api/super-admin/settings/openrouter/key
  def set_openrouter_key(conn, %{"api_key" => api_key}) do
    with true <- is_binary(api_key) and String.trim(api_key) != "",
         {:ok, _} <- Settings.put("openrouter_api_key", api_key) do
      json(conn, %{message: "openrouter key saved"})
    else
      false -> {:error, :invalid_api_key}
    end
  end

  def admin_landing_whatsapp_contact(conn, _params) do
    json(conn, %{data: landing_whatsapp_payload()})
  end

  def set_landing_whatsapp_contact(conn, params) do
    with {:ok, payload} <- validate_landing_whatsapp_payload(params),
         {:ok, _} <- Settings.put(@landing_whatsapp_key, payload) do
      json(conn, %{data: landing_whatsapp_payload()})
    end
  end

  defp landing_whatsapp_payload do
    stored = Settings.get(@landing_whatsapp_key, %{})

    %{
      enabled: Map.get(stored, "enabled", false),
      channel: Map.get(stored, "channel", "whatsapp"),
      label: Map.get(stored, "label", "WhatsApp Support"),
      phone_number: Map.get(stored, "phone_number"),
      message: Map.get(stored, "message")
    }
  end

  defp validate_landing_whatsapp_payload(params) do
    enabled = truthy?(params["enabled"])
    channel = params["channel"] |> normalize_optional_string("whatsapp")
    label = params["label"] |> normalize_optional_string("WhatsApp Support")

    phone_number =
      params["phone_number"]
      |> compose_phone_number(params["country_code"])
      |> normalize_optional_string(nil)

    message = params["message"] |> normalize_optional_string(nil)

    cond do
      channel != "whatsapp" ->
        {:error, :invalid_settings_payload}

      enabled and is_nil(phone_number) ->
        {:error, :landing_whatsapp_phone_required}

      enabled and not Regex.match?(~r/^\+?[1-9]\d{6,14}$/, phone_number) ->
        {:error, :invalid_phone_number}

      true ->
        {:ok,
         %{
           "enabled" => enabled,
           "channel" => channel,
           "label" => label,
           "phone_number" => phone_number,
           "message" => message
         }}
    end
  end

  defp normalize_optional_string(value, default) when is_binary(value) do
    case String.trim(value) do
      "" -> default
      trimmed -> trimmed
    end
  end

  defp normalize_optional_string(_, default), do: default

  defp compose_phone_number(phone_number, country_code) do
    normalized_phone = normalize_optional_string(phone_number, nil)
    normalized_country = normalize_optional_string(country_code, nil)

    cond do
      is_nil(normalized_phone) ->
        nil

      String.starts_with?(normalized_phone, "+") ->
        normalized_phone

      is_binary(normalized_country) and String.starts_with?(normalized_country, "+") ->
        "#{normalized_country}#{String.trim_leading(normalized_phone, "0")}"

      true ->
        normalized_phone
    end
  end

  defp truthy?(value), do: value in [true, "true", "1", 1, "on"]
end
