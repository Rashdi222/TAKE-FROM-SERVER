defmodule Back.BettingExternalMatchTest do
  use Back.DataCase, async: true

  alias Back.Betting
  alias Back.Providers.CompetitionFeed
  alias Back.Providers.Provider
  alias Back.Repo

  describe "upsert_external_match/1" do
    test "inserts and updates using provider+external_id" do
      attrs = %{
        provider: "sportmonks",
        external_id: "m_1001",
        sport: "cricket",
        team1: "Pakistan",
        team2: "India",
        start_time: "2026-03-20T14:00:00Z",
        status: "upcoming",
        score: %{"runs" => 0}
      }

      assert {:ok, inserted} = Betting.upsert_external_match(attrs)
      assert inserted.provider == "sportmonks"
      assert inserted.external_id == "m_1001"
      assert inserted.team1 == "Pakistan"

      assert {:ok, updated} =
               Betting.upsert_external_match(%{
                 provider: "sportmonks",
                 external_id: "m_1001",
                 sport: "cricket",
                 team1: "Pakistan",
                 team2: "India",
                 start_time: "2026-03-20T14:00:00Z",
                 status: "live",
                 score: %{"runs" => 123}
               })

      assert updated.id == inserted.id
      assert updated.status == :live
      assert updated.score == %{"runs" => 123}
    end

    test "rejects invalid payload with missing external key" do
      assert {:error, :invalid_external_match} =
               Betting.upsert_external_match(%{
                 provider: "sportmonks",
                 sport: "cricket",
                 team1: "A",
                 team2: "B",
                 start_time: "2026-03-20T14:00:00Z"
               })
    end

    test "preserves competition feed linkage when follow-up sync payload omits feed context" do
      provider =
        Repo.insert!(%Provider{
          name: "api_sports",
          is_enabled: true,
          is_active: true,
          config: %{}
        })

      feed =
        Repo.insert!(%CompetitionFeed{
          provider_id: provider.id,
          name: "Primera League",
          sport: "football",
          competition_key: "primera-2026",
          enabled: true,
          config: %{}
        })

      assert {:ok, inserted} =
               Betting.upsert_external_match(%{
                 provider: "api_sports",
                 external_id: "fx_2002",
                 sport: "football",
                 team1: "Home FC",
                 team2: "Away FC",
                 start_time: "2026-04-18T14:00:00Z",
                 status: "live",
                 competition_feed_id: feed.id,
                 raw_data: %{
                   "_competition_feed" => %{
                     "id" => feed.id,
                     "name" => "Primera League",
                     "competition_key" => "primera-2026"
                   }
                 }
               })

      assert inserted.competition_feed_id == feed.id
      assert get_in(inserted.raw_data, ["_competition_feed", "id"]) == feed.id

      assert {:ok, updated} =
               Betting.upsert_external_match(%{
                 provider: "api_sports",
                 external_id: "fx_2002",
                 sport: "football",
                 team1: "Home FC",
                 team2: "Away FC",
                 start_time: "2026-04-18T14:00:00Z",
                 status: "upcoming",
                 raw_data: %{"fixture" => %{"status" => %{"short" => "NS"}}}
               })

      assert updated.id == inserted.id
      assert updated.competition_feed_id == feed.id
      assert get_in(updated.raw_data, ["_competition_feed", "id"]) == feed.id
    end

    test "preserves real team names when live sync payload regresses to placeholders" do
      assert {:ok, inserted} =
               Betting.upsert_external_match(%{
                 provider: "sportmonks",
                 external_id: "m_9012",
                 sport: "cricket",
                 team1: "Karachi Kings",
                 team2: "Lahore Qalandars",
                 start_time: "2026-04-18T14:00:00Z",
                 status: "live",
                 score: %{"runs" => 22}
               })

      assert inserted.team1 == "Karachi Kings"
      assert inserted.team2 == "Lahore Qalandars"

      assert {:ok, updated} =
               Betting.upsert_external_match(%{
                 provider: "sportmonks",
                 external_id: "m_9012",
                 sport: "cricket",
                 team1: "Team 1",
                 team2: "Team 2",
                 start_time: "2026-04-18T14:00:00Z",
                 status: "live",
                 score: %{"runs" => 28}
               })

      assert updated.id == inserted.id
      assert updated.team1 == "Karachi Kings"
      assert updated.team2 == "Lahore Qalandars"
      assert updated.score == %{"runs" => 28}
    end

    test "recovers team names from historical provider team ids when incoming row is placeholder" do
      assert {:ok, _known_match} =
               Betting.upsert_external_match(%{
                 provider: "sportmonks",
                 external_id: "hist_1001",
                 sport: "cricket",
                 team1: "Pakistan",
                 team2: "India",
                 start_time: "2026-04-10T12:00:00Z",
                 status: "upcoming",
                 raw_data: %{
                   "localteam_id" => 293,
                   "visitorteam_id" => 44,
                   "localteam" => %{"id" => 293, "name" => "Pakistan"},
                   "visitorteam" => %{"id" => 44, "name" => "India"}
                 }
               })

      assert {:ok, imported_live} =
               Betting.upsert_external_match(%{
                 provider: "sportmonks",
                 external_id: "live_2002",
                 sport: "cricket",
                 team1: "Team 1",
                 team2: "Team 2",
                 start_time: "2026-04-18T12:00:00Z",
                 status: "live",
                 raw_data: %{
                   "localteam_id" => 293,
                   "visitorteam_id" => 44,
                   "status" => "1st Innings"
                 }
               })

      assert imported_live.team1 == "Pakistan"
      assert imported_live.team2 == "India"
    end
  end
end
