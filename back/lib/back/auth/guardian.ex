defmodule Back.Auth.Guardian do
  use Guardian, otp_app: :back

  alias Back.Accounts

  @doc "Encodes the user ID as the JWT subject."
  def subject_for_token(%{id: id}, _claims), do: {:ok, to_string(id)}
  def subject_for_token(_, _), do: {:error, :invalid_resource}

  @doc "Loads the user from the JWT subject (user ID)."
  def resource_from_claims(%{"sub" => id} = claims) do
    case Accounts.get_user(id) do
      nil ->
        {:error, :not_found}

      user ->
        if session_revoked?(user, claims) do
          {:error, :session_revoked}
        else
          {:ok, user}
        end
    end
  end

  def resource_from_claims(_), do: {:error, :invalid_claims}

  @doc "Generates an access token (1 hour TTL)."
  def generate_access_token(user) do
    encode_and_sign(user, %{}, token_type: "access", ttl: {1, :hour})
  end

  @doc "Generates a refresh token (7 day TTL)."
  def generate_refresh_token(user) do
    encode_and_sign(user, %{}, token_type: "refresh", ttl: {7, :day})
  end

  @doc "Revokes a token and adds it to the blacklist."
  def revoke_token(token) do
    case decode_and_verify(token) do
      {:ok, claims} ->
        Back.Auth.TokenBlacklist.blacklist(claims["jti"], claims["exp"])
        revoke(token)

      err ->
        err
    end
  end

  defp session_revoked?(%{session_revoked_at: nil}, _claims), do: false

  defp session_revoked?(%{session_revoked_at: revoked_at}, %{"iat" => iat})
       when is_integer(iat) do
    DateTime.to_unix(revoked_at) >= iat
  end

  defp session_revoked?(_, _), do: false
end
