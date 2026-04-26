defmodule Back.Providers.Dispatcher do
  @adapters %{
    "sportmonks" => Back.Providers.Sportmonks,
    "cricketdata" => Back.Providers.Cricketdata,
    "api_sports" => Back.Providers.ApiSports,
    "allsports" => Back.Providers.Allsports,
    "entitysport" => Back.Providers.Entitysport,
    "goalserve" => Back.Providers.Goalserve,
    "betsapi" => Back.Providers.Betsapi
  }

  def fetch_live(provider) when is_map(provider) do
    with {:ok, adapter} <- adapter_for(provider.name),
         {:ok, rows} <- adapter.fetch_live(adapter_config(provider)) do
      {:ok, Enum.map(rows, &normalize_with_provider_context(&1, adapter, provider)), provider}
    end
  end

  def fetch_fixtures(provider) when is_map(provider) do
    with {:ok, adapter} <- adapter_for(provider.name),
         {:ok, rows} <- adapter.fetch_fixtures(adapter_config(provider)) do
      {:ok, Enum.map(rows, &normalize_with_provider_context(&1, adapter, provider)), provider}
    end
  end

  def fetch_fixtures_for_feed(provider, feed) do
    with {:ok, adapter} <- adapter_for(provider.name),
         {:ok, rows} <- adapter.fetch_fixtures_for_feed(adapter_config(provider), feed) do
      {:ok, Enum.map(rows, &normalize_with_provider_context(&1, adapter, provider)), provider}
    end
  end

  def fetch_live_for_feed(provider, feed) do
    with {:ok, adapter} <- adapter_for(provider.name),
         {:ok, rows} <- adapter.fetch_live_for_feed(adapter_config(provider), feed) do
      {:ok, Enum.map(rows, &normalize_with_provider_context(&1, adapter, provider)), provider}
    end
  end

  def fetch_odds_for_match(provider, match) do
    with {:ok, adapter} <- adapter_for(provider.name),
         {:ok, rows} <- adapter.fetch_odds_for_match(adapter_config(provider), match) do
      {:ok, rows, provider}
    end
  end

  defp adapter_for(name) do
    case Map.fetch(@adapters, name) do
      {:ok, adapter} -> {:ok, adapter}
      :error -> {:error, :unknown_provider}
    end
  end

  defp adapter_config(provider) do
    Back.Providers.provider_adapter_config(provider)
  end

  defp normalize_with_provider_context(raw, adapter, provider) do
    normalized = adapter.normalize(raw)
    forced_sport = provider.config["sport"] || provider.config[:sport]

    if is_binary(forced_sport) and String.trim(forced_sport) != "" do
      Map.put(normalized, :sport, forced_sport)
    else
      normalized
    end
  end
end
