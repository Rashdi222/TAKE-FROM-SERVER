defmodule Back.Repo.Migrations.CreateAssistantFoundation do
  use Ecto.Migration

  def change do
    create table(:assistant_conversations, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :title, :string
      add :status, :string, null: false, default: "active"
      add :last_message_at, :utc_datetime
      add :summary, :text

      timestamps(type: :utc_datetime)
    end

    create index(:assistant_conversations, [:user_id])
    create index(:assistant_conversations, [:last_message_at])

    create table(:assistant_messages, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :conversation_id,
          references(:assistant_conversations, type: :binary_id, on_delete: :delete_all),
          null: false

      add :user_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :role, :string, null: false
      add :content, :text, null: false
      add :retrieval_context, :map
      add :model_used, :string
      add :token_usage_prompt, :integer
      add :token_usage_completion, :integer

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:assistant_messages, [:conversation_id])
    create index(:assistant_messages, [:user_id])

    create table(:assistant_documents, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :title, :string, null: false
      add :file_name, :string, null: false
      add :storage_path, :string, null: false
      add :mime_type, :string, null: false
      add :content_sha256, :string, null: false
      add :status, :string, null: false, default: "draft"
      add :uploaded_by_id, references(:users, type: :binary_id, on_delete: :restrict), null: false
      add :approved_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :approved_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create index(:assistant_documents, [:status])
    create index(:assistant_documents, [:uploaded_by_id])

    create unique_index(:assistant_documents, [:content_sha256],
             name: :assistant_documents_content_sha256_index
           )

    create table(:assistant_document_chunks, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :document_id,
          references(:assistant_documents, type: :binary_id, on_delete: :delete_all), null: false

      add :chunk_index, :integer, null: false
      add :heading_path, :string
      add :content, :text, null: false
      add :embedding_ref, :string
      add :token_count, :integer

      timestamps(type: :utc_datetime)
    end

    create index(:assistant_document_chunks, [:document_id])

    create unique_index(:assistant_document_chunks, [:document_id, :chunk_index],
             name: :assistant_document_chunks_document_id_chunk_index_index
           )

    create table(:assistant_faqs, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :question, :text, null: false
      add :answer, :text, null: false
      add :status, :string, null: false, default: "draft"
      add :source, :string, null: false, default: "manual"
      add :created_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :approved_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :approved_at, :utc_datetime
      add :usage_count, :integer, null: false, default: 0

      timestamps(type: :utc_datetime)
    end

    create index(:assistant_faqs, [:status])
    create index(:assistant_faqs, [:created_by_id])

    create table(:assistant_faq_drafts, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :question_digest_key, :string, null: false
      add :suggested_question, :text, null: false
      add :suggested_answer, :text
      add :evidence_count, :integer, null: false, default: 0
      add :sample_message_ids, :map, null: false, default: %{"ids" => []}
      add :status, :string, null: false, default: "draft"

      timestamps(type: :utc_datetime)
    end

    create index(:assistant_faq_drafts, [:status])
    create index(:assistant_faq_drafts, [:question_digest_key])

    create table(:assistant_question_digests, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :normalized_question, :text, null: false
      add :digest_key, :string, null: false
      add :first_seen_at, :utc_datetime, null: false
      add :last_seen_at, :utc_datetime, null: false
      add :count, :integer, null: false, default: 1

      add :latest_conversation_id,
          references(:assistant_conversations, type: :binary_id, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create unique_index(:assistant_question_digests, [:digest_key])
    create index(:assistant_question_digests, [:last_seen_at])

    create constraint(
             :assistant_document_chunks,
             :assistant_document_chunks_chunk_index_non_negative,
             check: "chunk_index >= 0"
           )

    create constraint(:assistant_faqs, :assistant_faqs_usage_count_non_negative,
             check: "usage_count >= 0"
           )

    create constraint(:assistant_faq_drafts, :assistant_faq_drafts_evidence_count_non_negative,
             check: "evidence_count >= 0"
           )

    create constraint(:assistant_question_digests, :assistant_question_digests_count_positive,
             check: "count >= 1"
           )
  end
end
