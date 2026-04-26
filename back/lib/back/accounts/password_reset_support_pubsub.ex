defmodule Back.Accounts.PasswordResetSupportPubSub do
  @moduledoc false

  def broadcast_owner_contacts_updated(owner_type, owner_id) do
    Phoenix.PubSub.broadcast(
      Back.PubSub,
      topic(owner_type, owner_id),
      {:password_reset_contacts_updated, %{owner_type: owner_type, owner_id: owner_id}}
    )
  end

  def topic(owner_type, owner_id), do: "password-reset-contacts:#{owner_type}:#{owner_id}"
end
