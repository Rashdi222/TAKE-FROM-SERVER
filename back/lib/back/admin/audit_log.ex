defmodule Back.Admin.AuditLog do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "admin_audit_logs" do
    field :action, :string
    field :target_type, :string
    field :target_id, :binary_id
    field :payload, :map
    field :ip_address, :string
    field :user_agent, :string

    belongs_to :actor, Back.Accounts.User

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(audit_log, attrs) do
    audit_log
    |> cast(attrs, [
      :actor_id,
      :action,
      :target_type,
      :target_id,
      :payload,
      :ip_address,
      :user_agent
    ])
    |> validate_required([:actor_id, :action])
    |> validate_length(:action, min: 3, max: 100)
    |> foreign_key_constraint(:actor_id)
  end
end
