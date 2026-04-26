defmodule Back.Assistant.Document do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @statuses ~w(draft approved archived)

  schema "assistant_documents" do
    field :title, :string
    field :file_name, :string
    field :storage_path, :string
    field :mime_type, :string
    field :content_sha256, :string
    field :status, :string, default: "draft"
    field :approved_at, :utc_datetime

    belongs_to :uploaded_by, Back.Accounts.User
    belongs_to :approved_by, Back.Accounts.User
    has_many :chunks, Back.Assistant.DocumentChunk

    timestamps(type: :utc_datetime)
  end

  def changeset(document, attrs) do
    document
    |> cast(attrs, [
      :title,
      :file_name,
      :storage_path,
      :mime_type,
      :content_sha256,
      :status,
      :uploaded_by_id,
      :approved_by_id,
      :approved_at
    ])
    |> validate_required([
      :title,
      :file_name,
      :storage_path,
      :mime_type,
      :content_sha256,
      :status,
      :uploaded_by_id
    ])
    |> validate_inclusion(:status, @statuses)
    |> validate_length(:title, min: 1, max: 255)
    |> validate_length(:content_sha256, is: 64)
    |> unique_constraint(:content_sha256, name: :assistant_documents_content_sha256_index)
  end

  def status_changeset(document, attrs) do
    document
    |> cast(attrs, [:status, :approved_by_id, :approved_at])
    |> validate_required([:status])
    |> validate_inclusion(:status, @statuses)
  end
end
