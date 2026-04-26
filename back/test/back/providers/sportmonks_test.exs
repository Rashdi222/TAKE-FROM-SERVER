defmodule Back.Providers.SportmonksTest do
  use ExUnit.Case, async: true

  alias Back.Providers.Sportmonks

  test "normalize marks fixture as live when provider status payload is map based" do
    raw = fixture_payload(%{"status" => %{"type" => "live"}})

    assert Sportmonks.normalize(raw).status == "live"
  end

  test "normalize infers live when scoreboard already has over/runs progression" do
    raw =
      fixture_payload(%{
        "status" => %{"name" => "Not Started"},
        "live" => true
      })

    assert Sportmonks.normalize(raw).status == "live"
  end

  test "normalize keeps completed status when provider reports finished state" do
    raw =
      fixture_payload(%{
        "status" => %{"name" => "Finished"},
        "live" => true
      })

    assert Sportmonks.normalize(raw).status == "completed"
  end

  test "normalize treats tagged livescores rows as live even before first scoring event" do
    raw =
      fixture_payload(%{
        "status" => %{"name" => "Not Started"},
        "runs" => [],
        "balls" => [],
        "_source_kind" => "livescores"
      })

    assert Sportmonks.normalize(raw).status == "live"
  end

  defp fixture_payload(overrides) do
    Map.merge(
      %{
        "id" => "fixture-1",
        "starting_at" => "2026-04-17T12:00:00Z",
        "localteam" => %{"id" => 11, "name" => "Team A"},
        "visitorteam" => %{"id" => 22, "name" => "Team B"},
        "runs" => [%{"inning" => 1, "score" => 24, "wickets" => 1, "overs" => "4.0"}],
        "balls" => [
          %{
            "scoreboard" => "S1",
            "ball" => "4.0",
            "team_id" => 11,
            "score" => %{"ball" => true, "runs" => 1}
          }
        ]
      },
      overrides
    )
  end
end
