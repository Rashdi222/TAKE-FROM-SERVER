defmodule Back.Assistant.DocumentChunk do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "assistant_document_chunks" do
    field :chunk_index, :integer
    field :heading_path, :string
    field :content, :string
    field :embedding_ref, :string
    field :token_count, :integer

    belongs_to :document, Back.Assistant.Document

    timestamps(type: :utc_datetime)
  end

  def changeset(chunk, attrs) do
    chunk
    |> cast(attrs, [
      :document_id,
      :chunk_index,
      :heading_path,
      :content,
      :embedding_ref,
      :token_count
    ])
    |> validate_required([:document_id, :chunk_index, :content])
    |> validate_number(:chunk_index, greater_than_or_equal_to: 0)
    |> validate_number(:token_count, greater_than_or_equal_to: 0)
    |> unique_constraint(:chunk_index,
      name: :assistant_document_chunks_document_id_chunk_index_index
    )
  end
end
