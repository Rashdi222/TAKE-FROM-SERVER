defmodule Back.Providers.ApiSportsTest do
  use ExUnit.Case, async: true

  alias Back.Providers.ApiSports

  test "normalize honors hold/cancel long status over stale live short code" do
    normalized =
      ApiSports.normalize(%{
        "fixture" => %{
          "id" => 123,
          "date" => "2026-04-18T18:00:00Z",
          "status" => %{"short" => "1H", "long" => "Match Suspended"}
        },
        "teams" => %{"home" => %{"name" => "A"}, "away" => %{"name" => "B"}},
        "goals" => %{"home" => 0, "away" => 0}
      })

    assert normalized.status == "upcoming"
  end

  test "normalize keeps live status when long text is not hold/cancel" do
    normalized =
      ApiSports.normalize(%{
        "fixture" => %{
          "id" => 456,
          "date" => "2026-04-18T18:00:00Z",
          "status" => %{"short" => "1H", "long" => "First Half"}
        },
        "teams" => %{"home" => %{"name" => "A"}, "away" => %{"name" => "B"}},
        "goals" => %{"home" => 0, "away" => 0}
      })

    assert normalized.status == "live"
  end
end
