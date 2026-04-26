defmodule Back.SettingsTest do
  use Back.DataCase, async: true

  alias Back.Settings

  describe "settings storage" do
    test "stores and retrieves active model" do
      assert {:ok, _} = Settings.put("openrouter_active_model", "openai/gpt-4o-mini")
      assert Settings.get("openrouter_active_model") == "openai/gpt-4o-mini"
    end

    test "stores sensitive api key encrypted and reads decrypted value" do
      assert {:ok, record} = Settings.put("openrouter_api_key", "sk-test-123")
      assert get_in(record.value, ["value"]) != "sk-test-123"
      assert Settings.get("openrouter_api_key") == "sk-test-123"
    end
  end
end
