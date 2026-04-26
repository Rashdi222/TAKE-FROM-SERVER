defmodule Back.AI.ModelCache do
  alias Back.Settings

  @models_url "https://openrouter.ai/api/v1/models"
  @cache_ttl_seconds 24 * 60 * 60

  def list_models(opts \\ []) do
    force_refresh = Keyword.get(opts, :force_refresh, false)

    with false <- force_refresh,
         true <- fresh_cache?(),
         models when is_list(models) <- Settings.get("openrouter_models_cache", nil) do
      {:ok, models}
    else
      _ -> fetch_and_cache_models()
    end
  end

  def fetch_and_cache_models do
    with {:ok, api_key} <- openrouter_api_key(),
         {:ok, %{status: 200, body: %{"data" => models}}} <-
           Req.get(@models_url, headers: auth_headers(api_key)),
         {:ok, _} <- Settings.put("openrouter_models_cache", models),
         {:ok, _} <-
           Settings.put(
             "openrouter_models_cached_at",
             DateTime.utc_now() |> DateTime.to_iso8601()
           ) do
      {:ok, models}
    else
      {:ok, %{status: status, body: body}} -> {:error, {:openrouter_error, status, body}}
      {:error, reason} -> {:error, reason}
      other -> {:error, other}
    end
  end

  defp fresh_cache? do
    with cached_at when is_binary(cached_at) <- Settings.get("openrouter_models_cached_at", nil),
         {:ok, dt, _} <- DateTime.from_iso8601(cached_at) do
      DateTime.diff(DateTime.utc_now(), dt) < @cache_ttl_seconds
    else
      _ -> false
    end
  end

  defp openrouter_api_key do
    key_from_settings = Settings.get("openrouter_api_key", nil)
    key_from_env = Application.get_env(:back, :openrouter_api_key)

    key = key_from_settings || key_from_env

    if is_binary(key) and byte_size(String.trim(key)) > 0 do
      {:ok, key}
    else
      {:error, :openrouter_api_key_not_configured}
    end
  end

  defp auth_headers(api_key) do
    [
      {"Authorization", "Bearer #{api_key}"},
      {"Accept", "application/json"},
      {"HTTP-Referer", "https://sixerbat.com"},
      {"X-Title", "Sixerbat"}
    ]
  end
end
