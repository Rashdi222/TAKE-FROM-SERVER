defmodule Back.Assistant.QuestionDigest do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "assistant_question_digests" do
    field :normalized_question, :string
    field :digest_key, :string
    field :first_seen_at, :utc_datetime
    field :last_seen_at, :utc_datetime
    field :count, :integer, default: 1

    belongs_to :latest_conversation, Back.Assistant.Conversation

    timestamps(type: :utc_datetime)
  end

  def changeset(digest, attrs) do
    digest
    |> cast(attrs, [
      :normalized_question,
      :digest_key,
      :first_seen_at,
      :last_seen_at,
      :count,
      :latest_conversation_id
    ])
    |> validate_required([
      :normalized_question,
      :digest_key,
      :first_seen_at,
      :last_seen_at,
      :count
    ])
    |> validate_number(:count, greater_than_or_equal_to: 1)
    |> unique_constraint(:digest_key)
  end
end
