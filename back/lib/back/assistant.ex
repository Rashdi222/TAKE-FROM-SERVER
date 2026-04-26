defmodule Back.Assistant do
  import Ecto.Query

  alias Back.Accounts.User

  alias Back.Assistant.{
    Conversation,
    Document,
    DocumentChunk,
    Faq,
    FaqDraft,
    MarkdownChunker,
    Message,
    QuestionDigest
  }

  alias Back.Repo
  require Logger

  @allowed_markdown_types ~w(text/markdown text/plain application/octet-stream)
  @faq_draft_threshold 5

  def list_conversations_for_user(%User{id: user_id}) do
    Repo.all(
      from c in Conversation,
        where: c.user_id == ^user_id,
        order_by: [desc: c.last_message_at, desc: c.inserted_at]
    )
  end

  def get_conversation_for_user!(id, %User{id: user_id}) do
    Repo.one!(
      from c in Conversation,
        where: c.id == ^id and c.user_id == ^user_id
    )
  end

  def create_conversation(%User{} = user, attrs \\ %{}) do
    attrs =
      attrs
      |> Map.new()
      |> Map.put("user_id", user.id)

    %Conversation{}
    |> Conversation.changeset(attrs)
    |> Repo.insert()
  end

  def update_conversation(%Conversation{} = conversation, attrs) do
    conversation
    |> Conversation.changeset(attrs)
    |> Repo.update()
  end

  def list_messages(%Conversation{id: conversation_id}) do
    Repo.all(
      from m in Message,
        where: m.conversation_id == ^conversation_id,
        order_by: [asc: m.inserted_at]
    )
  end

  def list_recent_messages(%Conversation{id: conversation_id}, limit \\ 12) do
    Message
    |> where([m], m.conversation_id == ^conversation_id)
    |> order_by([m], desc: m.inserted_at)
    |> limit(^limit)
    |> Repo.all()
    |> Enum.reverse()
  end

  def get_conversation_for_user(id, %User{id: user_id}) do
    Repo.one(
      from c in Conversation,
        where: c.id == ^id and c.user_id == ^user_id
    )
  end

  def create_message(%Conversation{} = conversation, attrs) do
    attrs =
      attrs
      |> Map.new()
      |> Map.put("conversation_id", conversation.id)

    Repo.transaction(fn ->
      with {:ok, message} <-
             %Message{}
             |> Message.changeset(attrs)
             |> Repo.insert(),
           {:ok, _conversation} <-
             conversation
             |> Ecto.Changeset.change(last_message_at: message.inserted_at)
             |> Repo.update() do
        message
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  def list_documents(opts \\ []) do
    status = Keyword.get(opts, :status)

    Document
    |> preload([:uploaded_by, :approved_by, :chunks])
    |> maybe_filter_document_status(status)
    |> order_by([d], desc: d.inserted_at)
    |> Repo.all()
  end

  def get_document!(id) do
    Document
    |> preload([:uploaded_by, :approved_by, :chunks])
    |> Repo.get!(id)
  end

  def upload_document(%User{} = actor, %Plug.Upload{} = upload, attrs \\ %{}) do
    with {:ok, %{document: document}} <- store_markdown_upload(actor, upload, attrs) do
      {:ok, document}
    end
  end

  def approve_document(id, %User{} = actor) do
    with :ok <- ensure_super_admin(actor) do
      id
      |> get_document!()
      |> Document.status_changeset(%{
        status: "approved",
        approved_by_id: actor.id,
        approved_at: DateTime.utc_now() |> DateTime.truncate(:second)
      })
      |> Repo.update()
    end
  end

  def archive_document(id, %User{} = actor) do
    with :ok <- ensure_super_admin(actor) do
      id
      |> get_document!()
      |> Document.status_changeset(%{
        status: "archived",
        approved_by_id: nil,
        approved_at: nil
      })
      |> Repo.update()
    end
  end

  def list_faqs(opts \\ []) do
    status = Keyword.get(opts, :status)

    Faq
    |> preload([:created_by, :approved_by])
    |> maybe_filter_faq_status(status)
    |> order_by([f], desc: f.updated_at)
    |> Repo.all()
  end

  def get_faq!(id) do
    Faq
    |> preload([:created_by, :approved_by])
    |> Repo.get!(id)
  end

  def create_faq(%User{} = actor, attrs) do
    with :ok <- ensure_super_admin(actor) do
      %Faq{}
      |> Faq.changeset(
        attrs
        |> Map.new()
        |> Map.put_new("source", "manual")
        |> Map.put("created_by_id", actor.id)
      )
      |> Repo.insert()
    end
  end

  def update_faq(id, %User{} = actor, attrs) do
    with :ok <- ensure_super_admin(actor) do
      id
      |> get_faq!()
      |> Faq.changeset(attrs)
      |> Repo.update()
    end
  end

  def delete_faq(id, %User{} = actor) do
    with :ok <- ensure_super_admin(actor) do
      id
      |> get_faq!()
      |> Repo.delete()
    end
  end

  def approve_faq(id, %User{} = actor) do
    with :ok <- ensure_super_admin(actor) do
      id
      |> get_faq!()
      |> Faq.status_changeset(%{
        status: "approved",
        approved_by_id: actor.id,
        approved_at: DateTime.utc_now() |> DateTime.truncate(:second)
      })
      |> Repo.update()
    end
  end

  def archive_faq(id, %User{} = actor) do
    with :ok <- ensure_super_admin(actor) do
      id
      |> get_faq!()
      |> Faq.status_changeset(%{
        status: "archived",
        approved_by_id: nil,
        approved_at: nil
      })
      |> Repo.update()
    end
  end

  def list_faq_drafts(opts \\ []) do
    status = Keyword.get(opts, :status)

    FaqDraft
    |> maybe_filter_draft_status(status)
    |> order_by([d], desc: d.updated_at)
    |> Repo.all()
  end

  def get_faq_draft!(id), do: Repo.get!(FaqDraft, id)

  def create_faq_draft(%User{} = actor, attrs) do
    with :ok <- ensure_super_admin(actor) do
      %FaqDraft{}
      |> FaqDraft.changeset(attrs)
      |> Repo.insert()
    end
  end

  def update_faq_draft(id, %User{} = actor, attrs) do
    with :ok <- ensure_super_admin(actor) do
      id
      |> get_faq_draft!()
      |> FaqDraft.changeset(attrs)
      |> Repo.update()
    end
  end

  def delete_faq_draft(id, %User{} = actor) do
    with :ok <- ensure_super_admin(actor) do
      id
      |> get_faq_draft!()
      |> Repo.delete()
    end
  end

  def dismiss_faq_draft(id, %User{} = actor) do
    with :ok <- ensure_super_admin(actor) do
      id
      |> get_faq_draft!()
      |> FaqDraft.status_changeset(%{status: "dismissed"})
      |> Repo.update()
    end
  end

  def get_question_digest_by_key(digest_key) when is_binary(digest_key) do
    Repo.get_by(QuestionDigest, digest_key: digest_key)
  end

  def record_question_signal(
        %Conversation{} = conversation,
        %Message{} = user_message,
        assistant_reply,
        opts \\ []
      ) do
    normalized_question = normalize_question(user_message.content)
    digest_key = digest_question(normalized_question)
    faq_signal = Keyword.get(opts, :faq_signal, false)

    Repo.transaction(fn ->
      now = DateTime.utc_now() |> DateTime.truncate(:second)

      digest =
        case Repo.get_by(QuestionDigest, digest_key: digest_key) do
          nil ->
            {:ok, created} =
              %QuestionDigest{}
              |> QuestionDigest.changeset(%{
                normalized_question: normalized_question,
                digest_key: digest_key,
                first_seen_at: now,
                last_seen_at: now,
                count: 1,
                latest_conversation_id: conversation.id
              })
              |> Repo.insert()

            created

          existing ->
            {:ok, updated} =
              existing
              |> QuestionDigest.changeset(%{
                normalized_question: normalized_question,
                last_seen_at: now,
                count: existing.count + 1,
                latest_conversation_id: conversation.id
              })
              |> Repo.update()

            updated
        end

      if digest.count >= @faq_draft_threshold do
        upsert_faq_draft_from_digest(digest, user_message, assistant_reply, faq_signal)
      end

      digest
    end)
  end

  def assistant_analytics do
    chat_volume =
      Repo.aggregate(
        from(m in Message, where: m.role in ["user", "assistant"]),
        :count,
        :id
      )

    active_users =
      Repo.aggregate(
        from(c in Conversation, select: c.user_id, distinct: true),
        :count,
        :user_id
      )

    top_digests =
      Repo.all(
        from d in QuestionDigest,
          order_by: [desc: d.count, desc: d.last_seen_at],
          limit: 10
      )

    %{
      total_chat_volume: chat_volume,
      active_users: active_users,
      pending_faq_drafts:
        Repo.aggregate(from(d in FaqDraft, where: d.status == "draft"), :count, :id),
      approved_faqs: Repo.aggregate(from(f in Faq, where: f.status == "approved"), :count, :id),
      approved_documents:
        Repo.aggregate(from(d in Document, where: d.status == "approved"), :count, :id),
      top_question_digests: Enum.map(top_digests, &question_digest_json/1)
    }
  end

  @spec store_markdown_upload(User.t(), Plug.Upload.t(), map()) ::
          {:ok,
           %{
             document: Document.t(),
             chunks: list(DocumentChunk.t()),
             content_sha256: String.t()
           }}
          | {:error, term()}
  def store_markdown_upload(%User{} = actor, %Plug.Upload{} = upload, attrs \\ %{}) do
    with :ok <- ensure_super_admin(actor),
         {:ok, validated} <- validate_markdown_upload(upload),
         {:ok, payload} <- persist_markdown_upload(actor, upload, attrs, validated) do
      {:ok, payload}
    end
  end

  defp persist_markdown_upload(%User{} = actor, %Plug.Upload{} = upload, attrs, validated) do
    attrs = Map.new(attrs)

    title =
      attrs
      |> Map.get("title", Map.get(attrs, :title, Path.rootname(upload.filename)))
      |> to_string()
      |> String.trim()

    relative_path = build_document_relative_path(actor.id, upload.filename)
    absolute_path = document_absolute_path(relative_path)

    absolute_path
    |> Path.dirname()
    |> File.mkdir_p!()

    File.cp!(upload.path, absolute_path)

    content = File.read!(absolute_path)
    chunks = MarkdownChunker.chunk(content)

    case Repo.transaction(fn ->
           {:ok, document} =
             %Document{}
             |> Document.changeset(%{
               title: if(title == "", do: Path.rootname(upload.filename), else: title),
               file_name: upload.filename,
               storage_path: relative_path,
               mime_type: validated.content_type,
               content_sha256: validated.content_sha256,
               status: "draft",
               uploaded_by_id: actor.id
             })
             |> Repo.insert()

           inserted_chunks =
             chunks
             |> Enum.with_index()
             |> Enum.map(fn {chunk, index} ->
               %DocumentChunk{}
               |> DocumentChunk.changeset(%{
                 document_id: document.id,
                 chunk_index: index,
                 heading_path: chunk.heading_path,
                 content: chunk.content,
                 token_count: chunk.token_count
               })
               |> Repo.insert!()
             end)

           %{
             document: document,
             chunks: inserted_chunks,
             content_sha256: validated.content_sha256
           }
         end) do
      {:ok, payload} ->
        {:ok, payload}

      {:error, reason} ->
        File.rm(absolute_path)
        {:error, reason}
    end
  rescue
    e in File.Error -> {:error, {:file_error, e.reason}}
  end

  defp validate_markdown_upload(%Plug.Upload{} = upload) do
    extension = upload.filename |> Path.extname() |> String.downcase()
    content_type = normalize_content_type(upload.content_type)

    cond do
      extension != ".md" ->
        {:error, :assistant_invalid_document_type}

      content_type not in @allowed_markdown_types ->
        {:error, :assistant_invalid_document_type}

      true ->
        {:ok,
         %{
           content_type: content_type,
           content_sha256: sha256_file!(upload.path)
         }}
    end
  end

  defp ensure_super_admin(%User{role: :super_admin}), do: :ok
  defp ensure_super_admin(_), do: {:error, :forbidden}

  defp maybe_filter_document_status(query, nil), do: query
  defp maybe_filter_document_status(query, status), do: where(query, [d], d.status == ^status)

  defp maybe_filter_faq_status(query, nil), do: query
  defp maybe_filter_faq_status(query, status), do: where(query, [f], f.status == ^status)

  defp maybe_filter_draft_status(query, nil), do: query
  defp maybe_filter_draft_status(query, status), do: where(query, [d], d.status == ^status)

  defp upsert_faq_draft_from_digest(digest, user_message, assistant_reply, faq_signal) do
    unless approved_faq_exists_for_question?(digest.normalized_question) do
      message_ids = %{"ids" => [user_message.id]}

      case Repo.get_by(FaqDraft, question_digest_key: digest.digest_key) do
        nil ->
          %FaqDraft{}
          |> FaqDraft.changeset(%{
            question_digest_key: digest.digest_key,
            suggested_question: String.trim(user_message.content),
            suggested_answer: if(faq_signal, do: assistant_reply, else: nil),
            evidence_count: digest.count,
            sample_message_ids: message_ids,
            status: "draft"
          })
          |> Repo.insert()

        existing ->
          sample_ids =
            existing.sample_message_ids
            |> normalize_sample_ids()
            |> Kernel.++([user_message.id])
            |> Enum.uniq()
            |> Enum.take(-10)

          existing
          |> FaqDraft.changeset(%{
            suggested_question: existing.suggested_question || String.trim(user_message.content),
            suggested_answer:
              existing.suggested_answer || if(faq_signal, do: assistant_reply, else: nil),
            evidence_count: digest.count,
            sample_message_ids: %{"ids" => sample_ids}
          })
          |> Repo.update()
      end
    end
  end

  defp approved_faq_exists_for_question?(normalized_question) do
    Repo.exists?(
      from f in Faq,
        where: f.status == "approved"
    )
    |> case do
      false ->
        false

      true ->
        Repo.all(from f in Faq, where: f.status == "approved", select: f.question)
        |> Enum.any?(fn question -> normalize_question(question) == normalized_question end)
    end
  end

  def normalize_question(text) when is_binary(text) do
    text
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9\s]/u, " ")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end

  def digest_question(normalized_question) when is_binary(normalized_question) do
    :crypto.hash(:sha256, normalized_question)
    |> Base.encode16(case: :lower)
  end

  defp normalize_sample_ids(%{"ids" => ids}) when is_list(ids), do: Enum.map(ids, &to_string/1)
  defp normalize_sample_ids(_), do: []

  defp question_digest_json(digest) do
    %{
      id: digest.id,
      digest_key: digest.digest_key,
      normalized_question: digest.normalized_question,
      count: digest.count,
      first_seen_at: digest.first_seen_at,
      last_seen_at: digest.last_seen_at,
      latest_conversation_id: digest.latest_conversation_id
    }
  end

  defp build_document_relative_path(owner_id, filename) do
    ext = filename |> Path.extname() |> String.downcase()
    base = Ecto.UUID.generate()
    Path.join([owner_id, "#{base}#{ext}"])
  end

  defp document_absolute_path(relative_path) do
    Application.app_dir(:back, "priv/uploads/assistant_docs/#{relative_path}")
  end

  defp sha256_file!(path) do
    path
    |> File.read!()
    |> then(&:crypto.hash(:sha256, &1))
    |> Base.encode16(case: :lower)
  end

  defp normalize_content_type(nil), do: "application/octet-stream"
  defp normalize_content_type(content_type), do: String.downcase(String.trim(content_type))
end
