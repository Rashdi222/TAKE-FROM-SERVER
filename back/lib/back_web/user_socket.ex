defmodule BackWeb.UserSocket do
  use Phoenix.Socket

  channel "match:*", BackWeb.MatchChannel
  channel "tennis:*", BackWeb.TennisChannel
  channel "user:*", BackWeb.UserChannel

  @impl true
  def connect(%{"token" => token}, socket, _connect_info) do
    case Back.Auth.Guardian.decode_and_verify(token) do
      {:ok, claims} ->
        case Back.Auth.Guardian.resource_from_claims(claims) do
          {:ok, user} -> {:ok, assign(socket, :current_user, user)}
          _ -> :error
        end

      _ ->
        :error
    end
  end

  # Allow unauthenticated connections for public match channels
  def connect(_params, socket, _connect_info), do: {:ok, socket}

  @impl true
  def id(%{assigns: %{current_user: user}}), do: "user_socket:#{user.id}"
  def id(_socket), do: nil
end
