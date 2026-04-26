defmodule BackWeb.UserAssistantController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Assistant
  alias Back.Assistant.Conversation
  alias Back.Assistant.ChatOrchestrator
  alias Back.Auth.Guardian

  def list_conversations(conn, _params) do
    user = Guardian.Plug.current_resource(conn)

    json(conn, %{
      data: Enum.map(Assistant.list_conversations_for_user(user), &conversation_json/1)
    })
  end

  def create_conversation(conn, params) do
    user = Guardian.Plug.current_resource(conn)

    with {:ok, conversation} <- Assistant.create_conversation(user, Map.take(params, ["title"])) do
      conn
      |> put_status(:created)
      |> json(%{data: conversation_json(conversation)})
    end
  end

  def list_messages(conn, %{"id" => id}) do
    user = Guardian.Plug.current_resource(conn)

    with %Conversation{} = conversation <- Assistant.get_conversation_for_user(id, user) do
      json(conn, %{
        data: %{
          conversation: conversation_json(conversation),
          messages: Enum.map(Assistant.list_messages(conversation), &message_json/1)
        }
      })
    else
      nil -> {:error, :not_found}
    end
  end

  def create_message(conn, %{"id" => id, "content" => content}) do
    user = Guardian.Plug.current_resource(conn)

    with {:ok, result} <- ChatOrchestrator.process_message(user, id, content) do
      conn
      |> put_status(:created)
      |> json(%{
        data: %{
          conversation: conversation_json(result.conversation),
          user_message: message_json(result.user_message),
          assistant_message: message_json(result.assistant_message)
        }
      })
    end
  end

  defp conversation_json(conversation) do
    %{
      id: conversation.id,
      title: conversation.title,
      status: conversation.status,
      last_message_at: conversation.last_message_at,
      summary: conversation.summary,
      inserted_at: conversation.inserted_at,
      updated_at: conversation.updated_at
    }
  end

  defp message_json(message) do
    %{
      id: message.id,
      role: message.role,
      content: message.content,
      inserted_at: message.inserted_at
    }
  end
end
