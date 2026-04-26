defmodule Back.Assistant.Message do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @roles ~w(user assistant system tool)

  schema "assistant_messages" do
    field :role, :string
    field :content, :string
    field :retrieval_context, :map
    field :model_used, :string
    field :token_usage_prompt, :integer
    field :token_usage_completion, :integer

    belongs_to :conversation, Back.Assistant.Conversation
    belongs_to :user, Back.Accounts.User

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(message, attrs) do
    message
    |> cast(attrs, [
      :conversation_id,
      :user_id,
      :role,
      :content,
      :retrieval_context,
      :model_used,
      :token_usage_prompt,
      :token_usage_completion
    ])
    |> validate_required([:conversation_id, :role, :content])
    |> validate_inclusion(:role, @roles)
    |> validate_number(:token_usage_prompt, greater_than_or_equal_to: 0)
    |> validate_number(:token_usage_completion, greater_than_or_equal_to: 0)
  end
end
