defmodule Back.Assistant.Conversation do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @statuses ~w(active archived closed)

  schema "assistant_conversations" do
    field :title, :string
    field :status, :string, default: "active"
    field :last_message_at, :utc_datetime
    field :summary, :string

    belongs_to :user, Back.Accounts.User
    has_many :messages, Back.Assistant.Message

    timestamps(type: :utc_datetime)
  end

  def changeset(conversation, attrs) do
    conversation
    |> cast(attrs, [:user_id, :title, :status, :last_message_at, :summary])
    |> validate_required([:user_id, :status])
    |> validate_inclusion(:status, @statuses)
    |> validate_length(:title, max: 200)
  end
end
