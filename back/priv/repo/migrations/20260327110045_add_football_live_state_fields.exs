defmodule Back.Repo.Migrations.AddFootballLiveStateFields do
  use Ecto.Migration

  def change do
    alter table(:matches) do
      add :elapsed_minute, :integer, default: 0, null: false
      add :stoppage_minute, :integer, default: 0, null: false
      add :home_score, :integer, default: 0, null: false
      add :away_score, :integer, default: 0, null: false
      add :home_red_cards, :integer, default: 0, null: false
      add :away_red_cards, :integer, default: 0, null: false
      add :home_corners, :integer, default: 0, null: false
      add :away_corners, :integer, default: 0, null: false
      add :home_shots_on_target, :integer, default: 0, null: false
      add :away_shots_on_target, :integer, default: 0, null: false
      add :tempo_index, :decimal
    end

    create constraint(:matches, :matches_elapsed_minute_non_negative,
             check: "elapsed_minute >= 0"
           )

    create constraint(:matches, :matches_stoppage_minute_non_negative,
             check: "stoppage_minute >= 0"
           )

    create constraint(:matches, :matches_home_score_non_negative, check: "home_score >= 0")
    create constraint(:matches, :matches_away_score_non_negative, check: "away_score >= 0")

    create constraint(:matches, :matches_home_red_cards_non_negative,
             check: "home_red_cards >= 0"
           )

    create constraint(:matches, :matches_away_red_cards_non_negative,
             check: "away_red_cards >= 0"
           )

    create constraint(:matches, :matches_home_corners_non_negative, check: "home_corners >= 0")
    create constraint(:matches, :matches_away_corners_non_negative, check: "away_corners >= 0")

    create constraint(:matches, :matches_home_shots_on_target_non_negative,
             check: "home_shots_on_target >= 0"
           )

    create constraint(:matches, :matches_away_shots_on_target_non_negative,
             check: "away_shots_on_target >= 0"
           )

    alter table(:match_live_events) do
      add :event_side, :string
      add :elapsed_minute, :integer, default: 0, null: false
      add :stoppage_minute, :integer, default: 0, null: false
      add :home_score, :integer, default: 0, null: false
      add :away_score, :integer, default: 0, null: false
      add :home_red_cards, :integer, default: 0, null: false
      add :away_red_cards, :integer, default: 0, null: false
      add :home_corners, :integer, default: 0, null: false
      add :away_corners, :integer, default: 0, null: false
      add :home_shots_on_target, :integer, default: 0, null: false
      add :away_shots_on_target, :integer, default: 0, null: false
      add :tempo_index, :decimal
    end

    create constraint(:match_live_events, :match_live_events_elapsed_minute_non_negative,
             check: "elapsed_minute >= 0"
           )

    create constraint(:match_live_events, :match_live_events_stoppage_minute_non_negative,
             check: "stoppage_minute >= 0"
           )

    create constraint(:match_live_events, :match_live_events_home_score_non_negative,
             check: "home_score >= 0"
           )

    create constraint(:match_live_events, :match_live_events_away_score_non_negative,
             check: "away_score >= 0"
           )

    create constraint(:match_live_events, :match_live_events_home_red_cards_non_negative,
             check: "home_red_cards >= 0"
           )

    create constraint(:match_live_events, :match_live_events_away_red_cards_non_negative,
             check: "away_red_cards >= 0"
           )

    create constraint(:match_live_events, :match_live_events_home_corners_non_negative,
             check: "home_corners >= 0"
           )

    create constraint(:match_live_events, :match_live_events_away_corners_non_negative,
             check: "away_corners >= 0"
           )

    create constraint(:match_live_events, :match_live_events_home_shots_on_target_non_negative,
             check: "home_shots_on_target >= 0"
           )

    create constraint(:match_live_events, :match_live_events_away_shots_on_target_non_negative,
             check: "away_shots_on_target >= 0"
           )
  end
end
