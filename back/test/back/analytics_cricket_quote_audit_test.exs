defmodule Back.AnalyticsCricketQuoteAuditTest do
  use Back.DataCase, async: true

  alias Back.Analytics
  alias Back.Betting.Match
  alias Back.Repo

  test "cricket quote calibration report summarizes stored audit rows" do
    match =
      %Match{}
      |> Match.changeset(%{
        sport: :cricket,
        team1: "Quetta",
        team2: "Karachi",
        start_time: DateTime.utc_now() |> DateTime.truncate(:second),
        status: :live,
        in_play_enabled: true
      })
      |> Repo.insert!()

    {1, _} =
      Analytics.insert_cricket_quote_audits([
        %{
          match_id: match.id,
          state_version: 7,
          event_seq: 21,
          market_key: "match_winner",
          selection_key: "team1",
          published_price: Decimal.new("1.88"),
          confidence_score: 0.63,
          valid_for_ms: 1500,
          reviewer_decision: "approve_with_dampening",
          reviewer_flags: ["soft_dampening:0.11"],
          active_playbooks: ["partnership_break"],
          lifecycle_analytics: %{"quote_count" => 12},
          fair_probability: 0.58,
          display_probability: 0.56,
          approved_probability: 0.53,
          reference_source: "one_x_bet_worker",
          reference_price: Decimal.new("1.76"),
          reference_probability: 0.5682,
          reference_probability_delta: 0.0382
        }
      ])

    report = Analytics.cricket_quote_calibration_report(limit: 10)

    assert report.total_quotes >= 1
    assert report.with_reference_count >= 1
    assert report.average_reference_drift > 0.0
    assert [%{market_key: "match_winner", selection_key: "team1"} | _] = report.recent_quotes
  end
end
