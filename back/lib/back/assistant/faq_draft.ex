defmodule Back.Assistant.FaqDraft do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @statuses ~w(draft reviewed converted dismissed)

  schema "assistant_faq_drafts" do
    field :question_digest_key, :string
    field :suggested_question, :string
    field :suggested_answer, :string
    field :evidence_count, :integer, default: 0
    field :sample_message_ids, :map, default: %{"ids" => []}
    field :status, :string, default: "draft"

    timestamps(type: :utc_datetime)
  end

  def changeset(draft, attrs) do
    draft
    |> cast(attrs, [
      :question_digest_key,
      :suggested_question,
      :suggested_answer,
      :evidence_count,
      :sample_message_ids,
      :status
    ])
    |> validate_required([:question_digest_key, :suggested_question, :status])
    |> validate_inclusion(:status, @statuses)
    |> validate_number(:evidence_count, greater_than_or_equal_to: 0)
  end

  def status_changeset(draft, attrs) do
    draft
    |> cast(attrs, [:status])
    |> validate_required([:status])
    |> validate_inclusion(:status, @statuses)
  end
end
