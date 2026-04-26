defmodule Back.Assistant.Faq do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @statuses ~w(draft approved archived)
  @sources ~w(manual auto_generated imported)

  schema "assistant_faqs" do
    field :question, :string
    field :answer, :string
    field :status, :string, default: "draft"
    field :source, :string, default: "manual"
    field :approved_at, :utc_datetime
    field :usage_count, :integer, default: 0

    belongs_to :created_by, Back.Accounts.User
    belongs_to :approved_by, Back.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(faq, attrs) do
    faq
    |> cast(attrs, [
      :question,
      :answer,
      :status,
      :source,
      :created_by_id,
      :approved_by_id,
      :approved_at,
      :usage_count
    ])
    |> validate_required([:question, :answer, :status, :source])
    |> validate_inclusion(:status, @statuses)
    |> validate_inclusion(:source, @sources)
    |> validate_length(:question, min: 3, max: 2000)
    |> validate_length(:answer, min: 3, max: 20_000)
    |> validate_number(:usage_count, greater_than_or_equal_to: 0)
  end

  def status_changeset(faq, attrs) do
    faq
    |> cast(attrs, [:status, :approved_by_id, :approved_at])
    |> validate_required([:status])
    |> validate_inclusion(:status, @statuses)
  end
end
