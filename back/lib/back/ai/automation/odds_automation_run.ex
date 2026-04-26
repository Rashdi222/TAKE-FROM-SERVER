defmodule Back.AI.Automation.OddsAutomationRun do
  use Ecto.Schema
  import Ecto.Changeset

  @phases ~w(prematch inplay)
  @statuses ~w(started success failure skipped)
  @triggers ~w(manual_import scheduled_fixtures scheduled_live manual_refresh live_update)

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "odds_automation_runs" do
    field :phase, :string
    field :status, :string
    field :trigger, :string
    field :model, :string
    field :generated_count, :integer, default: 0
    field :state_hash, :string
    field :reason, :string
    field :metadata, :map, default: %{}

    belongs_to :match, Back.Betting.Match
    belongs_to :competition_feed, Back.Providers.CompetitionFeed

    timestamps(type: :utc_datetime)
  end

  def changeset(run, attrs) do
    run
    |> cast(attrs, [
      :match_id,
      :competition_feed_id,
      :phase,
      :status,
      :trigger,
      :model,
      :generated_count,
      :state_hash,
      :reason,
      :metadata
    ])
    |> validate_required([:match_id, :competition_feed_id, :phase, :status, :trigger])
    |> validate_inclusion(:phase, @phases)
    |> validate_inclusion(:status, @statuses)
    |> validate_inclusion(:trigger, @triggers)
    |> validate_number(:generated_count, greater_than_or_equal_to: 0)
    |> foreign_key_constraint(:match_id)
    |> foreign_key_constraint(:competition_feed_id)
  end
end
