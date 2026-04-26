defmodule BackWeb.AdminAssistantController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Assistant
  alias Back.Auth.Guardian

  def list_documents(conn, params) do
    status = blank_to_nil(params["status"])
    json(conn, %{data: Enum.map(Assistant.list_documents(status: status), &document_json/1)})
  end

  def upload_document(conn, %{"document" => %Plug.Upload{} = upload} = params) do
    actor = Guardian.Plug.current_resource(conn)

    with {:ok, document} <- Assistant.upload_document(actor, upload, Map.take(params, ["title"])) do
      conn
      |> put_status(:created)
      |> json(%{data: document_json(Assistant.get_document!(document.id))})
    end
  end

  def approve_document(conn, %{"id" => id}) do
    actor = Guardian.Plug.current_resource(conn)

    with {:ok, document} <- Assistant.approve_document(id, actor) do
      json(conn, %{data: document_json(Assistant.get_document!(document.id))})
    end
  end

  def archive_document(conn, %{"id" => id}) do
    actor = Guardian.Plug.current_resource(conn)

    with {:ok, document} <- Assistant.archive_document(id, actor) do
      json(conn, %{data: document_json(Assistant.get_document!(document.id))})
    end
  end

  def list_faqs(conn, params) do
    status = blank_to_nil(params["status"])
    json(conn, %{data: Enum.map(Assistant.list_faqs(status: status), &faq_json/1)})
  end

  def create_faq(conn, params) do
    actor = Guardian.Plug.current_resource(conn)

    with {:ok, faq} <- Assistant.create_faq(actor, params) do
      conn |> put_status(:created) |> json(%{data: faq_json(Assistant.get_faq!(faq.id))})
    end
  end

  def update_faq(conn, %{"id" => id} = params) do
    actor = Guardian.Plug.current_resource(conn)

    with {:ok, faq} <- Assistant.update_faq(id, actor, params) do
      json(conn, %{data: faq_json(Assistant.get_faq!(faq.id))})
    end
  end

  def delete_faq(conn, %{"id" => id}) do
    actor = Guardian.Plug.current_resource(conn)

    with {:ok, _faq} <- Assistant.delete_faq(id, actor) do
      json(conn, %{data: %{deleted: true}})
    end
  end

  def approve_faq(conn, %{"id" => id}) do
    actor = Guardian.Plug.current_resource(conn)

    with {:ok, faq} <- Assistant.approve_faq(id, actor) do
      json(conn, %{data: faq_json(Assistant.get_faq!(faq.id))})
    end
  end

  def archive_faq(conn, %{"id" => id}) do
    actor = Guardian.Plug.current_resource(conn)

    with {:ok, faq} <- Assistant.archive_faq(id, actor) do
      json(conn, %{data: faq_json(Assistant.get_faq!(faq.id))})
    end
  end

  def list_faq_drafts(conn, params) do
    status = blank_to_nil(params["status"])
    json(conn, %{data: Enum.map(Assistant.list_faq_drafts(status: status), &faq_draft_json/1)})
  end

  def create_faq_draft(conn, params) do
    actor = Guardian.Plug.current_resource(conn)

    with {:ok, draft} <- Assistant.create_faq_draft(actor, params) do
      conn |> put_status(:created) |> json(%{data: faq_draft_json(draft)})
    end
  end

  def update_faq_draft(conn, %{"id" => id} = params) do
    actor = Guardian.Plug.current_resource(conn)

    with {:ok, draft} <- Assistant.update_faq_draft(id, actor, params) do
      json(conn, %{data: faq_draft_json(draft)})
    end
  end

  def delete_faq_draft(conn, %{"id" => id}) do
    actor = Guardian.Plug.current_resource(conn)

    with {:ok, _draft} <- Assistant.delete_faq_draft(id, actor) do
      json(conn, %{data: %{deleted: true}})
    end
  end

  def dismiss_faq_draft(conn, %{"id" => id}) do
    actor = Guardian.Plug.current_resource(conn)

    with {:ok, draft} <- Assistant.dismiss_faq_draft(id, actor) do
      json(conn, %{data: faq_draft_json(draft)})
    end
  end

  def analytics(conn, _params) do
    json(conn, %{data: Assistant.assistant_analytics()})
  end

  defp blank_to_nil(nil), do: nil
  defp blank_to_nil(""), do: nil
  defp blank_to_nil(value), do: value

  defp document_json(document) do
    %{
      id: document.id,
      title: document.title,
      file_name: document.file_name,
      storage_path: document.storage_path,
      mime_type: document.mime_type,
      content_sha256: document.content_sha256,
      status: document.status,
      uploaded_by_id: document.uploaded_by_id,
      approved_by_id: document.approved_by_id,
      approved_at: document.approved_at,
      inserted_at: document.inserted_at,
      updated_at: document.updated_at,
      uploaded_by: actor_json(document.uploaded_by),
      approved_by: actor_json(document.approved_by),
      chunks: Enum.map(document.chunks || [], &chunk_json/1)
    }
  end

  defp chunk_json(chunk) do
    %{
      id: chunk.id,
      chunk_index: chunk.chunk_index,
      heading_path: chunk.heading_path,
      content: chunk.content,
      token_count: chunk.token_count
    }
  end

  defp faq_json(faq) do
    %{
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      status: faq.status,
      source: faq.source,
      usage_count: faq.usage_count,
      created_by_id: faq.created_by_id,
      approved_by_id: faq.approved_by_id,
      approved_at: faq.approved_at,
      inserted_at: faq.inserted_at,
      updated_at: faq.updated_at,
      created_by: actor_json(faq.created_by),
      approved_by: actor_json(faq.approved_by)
    }
  end

  defp faq_draft_json(draft) do
    %{
      id: draft.id,
      question_digest_key: draft.question_digest_key,
      suggested_question: draft.suggested_question,
      suggested_answer: draft.suggested_answer,
      evidence_count: draft.evidence_count,
      sample_message_ids: draft.sample_message_ids,
      status: draft.status,
      inserted_at: draft.inserted_at,
      updated_at: draft.updated_at
    }
  end

  defp actor_json(nil), do: nil

  defp actor_json(user) do
    %{
      id: user.id,
      username: user.username,
      role: user.role
    }
  end
end
