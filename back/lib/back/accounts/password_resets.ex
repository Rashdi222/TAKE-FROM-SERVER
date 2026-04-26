defmodule Back.Accounts.PasswordResets do
  import Ecto.Query

  alias Back.Accounts.PasswordResetToken
  alias Back.Accounts.User
  alias Back.Admin
  alias Back.Repo

  @purpose "player_password_reset"
  @expiry_seconds 2 * 60 * 60

  def generate_player_reset(master_admin_id, %User{} = player, reset_base_url, audit_meta \\ %{}) do
    now = now_utc()
    expires_at = DateTime.add(now, @expiry_seconds, :second)
    raw_token = build_raw_token()
    token_hash = hash_token(raw_token)

    result =
      Ecto.Multi.new()
      |> Ecto.Multi.update_all(
        :expire_existing,
        from(t in PasswordResetToken,
          where:
            t.user_id == ^player.id and t.purpose == ^@purpose and is_nil(t.used_at) and
              t.expires_at > ^now
        ),
        set: [used_at: now]
      )
      |> Ecto.Multi.insert(
        :token,
        PasswordResetToken.changeset(%PasswordResetToken{}, %{
          user_id: player.id,
          created_by_id: master_admin_id,
          purpose: @purpose,
          token_hash: token_hash,
          expires_at: expires_at
        })
      )
      |> Repo.transaction()

    case result do
      {:ok, %{token: _token}} ->
        reset_url = build_reset_url(reset_base_url, raw_token)

        _ =
          Admin.log_action(%{
            actor_id: master_admin_id,
            action: "generate_player_password_reset_link",
            target_type: "User",
            target_id: player.id,
            payload: %{
              reset_url: reset_url,
              expires_at: expires_at,
              purpose: @purpose
            },
            ip_address: audit_meta[:ip_address] || audit_meta["ip_address"],
            user_agent: audit_meta[:user_agent] || audit_meta["user_agent"]
          })

        {:ok, %{player_id: player.id, reset_url: reset_url, expires_at: expires_at}}

      {:error, _step, reason, _changes} ->
        {:error, reason}
    end
  end

  def validate_player_reset_token(raw_token) when is_binary(raw_token) do
    with {:ok, token} <- get_active_token(raw_token) do
      {:ok,
       %{
         user_id: token.user_id,
         expires_at: token.expires_at,
         purpose: token.purpose
       }}
    end
  end

  def complete_player_reset(raw_token, password, password_confirmation, audit_meta \\ %{}) do
    now = now_utc()

    with true <- password == password_confirmation || {:error, :password_confirmation_mismatch},
         {:ok, token} <- get_active_token(raw_token),
         %User{} = user <- Repo.get!(User, token.user_id) do
      result =
        Ecto.Multi.new()
        |> Ecto.Multi.update(
          :user,
          User.password_update_changeset(user, %{password: password, session_revoked_at: now})
        )
        |> Ecto.Multi.update(:token, Ecto.Changeset.change(token, used_at: now))
        |> Repo.transaction()

      case result do
        {:ok, %{user: updated_user}} ->
          _ =
            Admin.log_action(%{
              actor_id: token.user_id,
              action: "complete_player_password_reset",
              target_type: "User",
              target_id: token.user_id,
              payload: %{
                purpose: @purpose,
                token_id: token.id
              },
              ip_address: audit_meta[:ip_address] || audit_meta["ip_address"],
              user_agent: audit_meta[:user_agent] || audit_meta["user_agent"]
            })

          {:ok, updated_user}

        {:error, _step, reason, _changes} ->
          {:error, reason}
      end
    end
  end

  def hash_token(raw_token) when is_binary(raw_token) do
    :crypto.hash(:sha256, raw_token)
    |> Base.encode16(case: :lower)
  end

  defp get_active_token(raw_token) do
    now = now_utc()
    token_hash = hash_token(raw_token)

    case Repo.one(
           from t in PasswordResetToken,
             where:
               t.token_hash == ^token_hash and t.purpose == ^@purpose and is_nil(t.used_at) and
                 t.expires_at > ^now,
             limit: 1
         ) do
      nil -> {:error, :invalid_or_expired_reset_token}
      token -> {:ok, token}
    end
  end

  defp build_raw_token do
    32
    |> :crypto.strong_rand_bytes()
    |> Base.url_encode64(padding: false)
  end

  defp build_reset_url(base_url, raw_token) do
    separator = if String.contains?(base_url, "?"), do: "&", else: "?"
    "#{base_url}#{separator}token=#{raw_token}"
  end

  defp now_utc, do: DateTime.utc_now() |> DateTime.truncate(:second)
end
