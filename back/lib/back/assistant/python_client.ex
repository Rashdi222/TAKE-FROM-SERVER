defmodule Back.Assistant.PythonClient do
  @moduledoc false

  @recv_timeout 60_000
  @connect_timeout 5_000
  @fallback_reply "I'm experiencing a high volume of requests right now. Please try again in a moment."

  def chat(payload) when is_map(payload) do
    task =
      Task.Supervisor.async_nolink(Back.TaskSupervisor, fn ->
        perform_chat(payload)
      end)

    try do
      case Task.await(task, @recv_timeout + 1_000) do
        {:ok, response} -> response
        {:error, _reason} -> fallback_response()
      end
    catch
      :exit, _ -> fallback_response()
    end
  end

  defp perform_chat(payload) do
    if mock_enabled?() do
      Process.sleep(350)

      {:ok,
       %{
         reply: mock_reply(payload),
         model: payload["model"] || "mock-assistant",
         answer_type: "mock",
         retrieval_used: true,
         retrieval_sources: summarize_retrieval(payload),
         usage: %{prompt_tokens: 0, completion_tokens: 0},
         faq_signal: false
       }}
    else
      http_chat(payload)
    end
  rescue
    _ -> {:error, :assistant_python_failed}
  end

  defp http_chat(payload) do
    case Req.post(endpoint(),
           json: payload,
           receive_timeout: @recv_timeout,
           connect_options: [timeout: @connect_timeout]
         ) do
      {:ok, %{status: status, body: body}} when status in 200..299 and is_map(body) ->
        {:ok,
         %{
           reply: body["reply"] || @fallback_reply,
           model: body["model"] || payload["model"],
           answer_type: body["answer_type"] || "assistant",
           retrieval_used: body["retrieval_used"] || false,
           retrieval_sources: body["retrieval_sources"] || [],
           usage: body["usage"] || %{},
           faq_signal: body["faq_signal"] || false
         }}

      {:ok, %{status: _status}} ->
        {:error, :assistant_python_http_error}

      {:error, %Req.TransportError{reason: :timeout}} ->
        {:error, :assistant_python_timeout}

      {:error, _reason} ->
        {:error, :assistant_python_unavailable}
    end
  end

  defp mock_enabled? do
    Application.get_env(:back, :assistant_python_mock_enabled, false)
  end

  defp endpoint do
    Application.get_env(:back, :assistant_python_endpoint) ||
      "#{Application.get_env(:back, :ai_engine_url, "http://127.0.0.1:8001")}/assistant/chat"
  end

  defp mock_reply(payload) do
    user_message = get_in(payload, ["message"]) || "your request"
    faq_count = payload |> get_in(["retrieved_faqs"]) |> List.wrap() |> length()
    doc_count = payload |> get_in(["retrieved_docs"]) |> List.wrap() |> length()

    "I understand your question about #{user_message}. I found #{faq_count} FAQ item(s) and #{doc_count} document excerpt(s) in the current assistant knowledge base. The Python assistant engine is not live yet, so this is a placeholder response from the Elixir orchestrator path."
  end

  defp summarize_retrieval(payload) do
    faq_sources =
      payload
      |> get_in(["retrieved_faqs"])
      |> List.wrap()
      |> Enum.map(fn faq -> %{type: "faq", id: faq["id"], title: faq["question"]} end)

    doc_sources =
      payload
      |> get_in(["retrieved_docs"])
      |> List.wrap()
      |> Enum.map(fn doc ->
        %{type: "document_chunk", id: doc["id"], title: doc["heading_path"]}
      end)

    faq_sources ++ doc_sources
  end

  defp fallback_response do
    %{
      reply: @fallback_reply,
      model: "assistant-fallback",
      answer_type: "fallback",
      retrieval_used: false,
      retrieval_sources: [],
      usage: %{},
      faq_signal: false
    }
  end
end
