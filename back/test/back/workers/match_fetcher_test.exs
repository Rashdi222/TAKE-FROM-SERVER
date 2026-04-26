defmodule Back.Workers.MatchFetcherTest do
  use Back.DataCase, async: false

  alias Back.Betting.Match
  alias Back.Repo
  alias Back.Workers.MatchFetcher

  test "polling without active provider does not crash" do
    {:ok, pid} = start_supervised(MatchFetcher)
    send(pid, :poll_live)
    send(pid, :poll_fixtures)

    # allow async message handling
    Process.sleep(20)
    assert Process.alive?(pid)
  end

  test "sync_now auto-promotes overdue configured-sport upcoming matches to live" do
    {:ok, _pid} = start_supervised(MatchFetcher)
    original_sports = Application.get_env(:back, :kickoff_live_auto_promotion_sports, [:football])
    Application.put_env(:back, :kickoff_live_auto_promotion_sports, [:tennis])

    on_exit(fn ->
      Application.put_env(:back, :kickoff_live_auto_promotion_sports, original_sports)
    end)

    past_start =
      DateTime.utc_now() |> DateTime.add(-5 * 60, :second) |> DateTime.truncate(:second)

    {:ok, match} =
      %Match{}
      |> Match.changeset(%{
        sport: :tennis,
        team1: "Alpha",
        team2: "Beta",
        start_time: past_start,
        status: :upcoming,
        in_play_enabled: false,
        provider: "api_tennis",
        external_id: "fixture-test-1"
      })
      |> Repo.insert()

    result = MatchFetcher.sync_now()
    assert get_in(result, [:kickoff_promotions, :promoted]) >= 1

    promoted = Repo.get!(Match, match.id)
    assert promoted.status == :live
    assert promoted.in_play_enabled == true
  end
end
