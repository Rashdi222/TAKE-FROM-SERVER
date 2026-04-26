defmodule Back.AI.ModelCacheTest do
  use Back.DataCase, async: true

  alias Back.AI.ModelCache
  alias Back.Settings

  test "returns cached models when cache is fresh" do
    models = [%{"id" => "openai/gpt-4o-mini"}]
    now = DateTime.utc_now() |> DateTime.to_iso8601()

    assert {:ok, _} = Settings.put("openrouter_models_cache", models)
    assert {:ok, _} = Settings.put("openrouter_models_cached_at", now)

    assert {:ok, ^models} = ModelCache.list_models()
  end
end
