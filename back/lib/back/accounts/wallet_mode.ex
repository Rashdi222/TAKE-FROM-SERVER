defmodule Back.Accounts.WalletMode do
  @moduledoc false

  alias Back.Accounts.User

  @type t :: :self_service | :managed_by_master_admin

  @spec resolve(map()) :: t()
  def resolve(%User{role: :player, created_by_id: created_by_id}) when not is_nil(created_by_id),
    do: :managed_by_master_admin

  def resolve(%{role: :player, created_by_id: created_by_id}) when not is_nil(created_by_id),
    do: :managed_by_master_admin

  def resolve(_), do: :self_service

  @spec serialize(t()) :: String.t()
  def serialize(:managed_by_master_admin), do: "managed_by_master_admin"
  def serialize(:self_service), do: "self_service"
end
