defmodule Back.ProvidersTest do
  use Back.DataCase, async: true

  alias Back.Providers

  describe "providers" do
    test "create_or_update_provider creates new provider" do
      assert {:ok, provider} =
               Providers.create_or_update_provider(%{
                 "name" => "sportmonks",
                 "api_key" => "abc123",
                 "base_url" => "https://api.sportmonks.com/v3/cricket"
               })

      assert provider.name == "sportmonks"
      assert provider.base_url == "https://api.sportmonks.com/v3/cricket"
      assert provider.api_key != "abc123"
    end

    test "activate_provider enforces a single active provider" do
      {:ok, p1} = Providers.create_or_update_provider(%{"name" => "sportmonks"})
      {:ok, p2} = Providers.create_or_update_provider(%{"name" => "cricketdata"})

      assert {:ok, %{activate: _}} = Providers.activate_provider(p1.id)
      assert {:ok, %{activate: _}} = Providers.activate_provider(p2.id)

      all = Providers.list_providers()
      active = Enum.filter(all, & &1.is_active)

      assert length(active) == 1
      assert hd(active).id == p2.id
    end

    test "get_active_provider returns decrypted api key" do
      {:ok, provider} =
        Providers.create_or_update_provider(%{
          "name" => "entitysport",
          "api_key" => "secret-token",
          "is_active" => true
        })

      assert provider.api_key != "secret-token"

      assert {:ok, active} = Providers.get_active_provider()
      assert active.name == "entitysport"
      assert active.api_key == "secret-token"
    end
  end
end
