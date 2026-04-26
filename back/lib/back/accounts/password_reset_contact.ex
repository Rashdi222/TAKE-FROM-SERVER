defmodule Back.Accounts.PasswordResetContact do
  use Ecto.Schema
  import Ecto.Changeset

  @owner_types [:super_admin, :master_admin]
  @channels [:whatsapp, :phone, :email]

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "password_reset_contacts" do
    field :owner_type, Ecto.Enum, values: @owner_types
    field :channel, Ecto.Enum, values: @channels
    field :label, :string
    field :value, :string
    field :is_active, :boolean, default: true

    belongs_to :owner, Back.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(contact, attrs) do
    contact
    |> cast(attrs, [:owner_type, :owner_id, :channel, :label, :value, :is_active])
    |> validate_required([:owner_type, :owner_id, :channel, :value])
    |> validate_length(:label, max: 80)
    |> validate_length(:value, min: 5, max: 120)
    |> foreign_key_constraint(:owner_id)
  end
end
