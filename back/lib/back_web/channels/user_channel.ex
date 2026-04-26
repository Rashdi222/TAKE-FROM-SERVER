defmodule BackWeb.UserChannel do
  use BackWeb, :channel

  alias Back.Auth.Guardian

  @doc "Join a private user room: 'user:USER_ID'. Requires valid Guardian token."
  def join("user:" <> user_id, %{"token" => token}, socket) do
    case Guardian.decode_and_verify(token) do
      {:ok, claims} ->
        case Guardian.resource_from_claims(claims) do
          {:ok, %{id: ^user_id} = user} ->
            {:ok, assign(socket, :current_user, user)}

          _ ->
            {:error, %{reason: "unauthorized"}}
        end

      _ ->
        {:error, %{reason: "invalid token"}}
    end
  end

  def join(_, _, _), do: {:error, %{reason: "unauthorized"}}

  # ── Server-side push helpers (called from betting.ex) ────────────────────────

  @doc "Pushes updated balance to the user's private channel."
  def push_balance_update(user_id, balance) do
    BackWeb.Endpoint.broadcast("user:#{user_id}", "balance_updated", %{balance: balance})
  end

  @doc "Pushes bet settlement result to the user's private channel."
  def push_bet_settled(user_id, bet_id, result) do
    BackWeb.Endpoint.broadcast("user:#{user_id}", "bet_settled", %{bet_id: bet_id, result: result})
  end
end
