defmodule Back.MultiSource.Schemas.EgressGateway do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "egress_gateways" do
    field :name, :string
    field :url, :string
    field :is_default_direct, :boolean, default: false

    has_many :scraper_configurations, Back.MultiSource.Schemas.ScraperConfiguration,
      foreign_key: :gateway_id

    timestamps(type: :utc_datetime)
  end

  def changeset(gateway, attrs) do
    gateway
    |> cast(attrs, [:name, :url, :is_default_direct])
    |> validate_required([:name])
    |> validate_length(:name, min: 2)
    |> validate_change(:url, &validate_optional_url/2)
    |> validate_route_requirements()
    |> unique_constraint(:name)
  end

  defp validate_optional_url(_field, nil), do: []
  defp validate_optional_url(_field, ""), do: []

  defp validate_optional_url(field, value) when is_binary(value) do
    case URI.parse(value) do
      %URI{scheme: scheme, host: host} when scheme in ["http", "https"] and is_binary(host) -> []
      _ -> [{field, "must be a valid http or https proxy URL"}]
    end
  end

  defp validate_route_requirements(changeset) do
    if get_field(changeset, :is_default_direct) do
      put_change(changeset, :url, nil)
    else
      validate_required(changeset, [:url])
    end
  end
end
