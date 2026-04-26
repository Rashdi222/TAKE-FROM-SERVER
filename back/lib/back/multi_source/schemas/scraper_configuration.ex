defmodule Back.MultiSource.Schemas.ScraperConfiguration do
  use Ecto.Schema
  import Ecto.Changeset

  @transports ~w(websocket polling)

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "scraper_configurations" do
    field :source_name, :string
    field :transport, :string, default: "websocket"
    field :bootstrap_url, :string
    field :ws_url, :string
    field :poll_url, :string
    field :proxy_url, :string
    field :is_active, :boolean, default: false
    belongs_to :gateway, Back.MultiSource.Schemas.EgressGateway

    timestamps(type: :utc_datetime)
  end

  def changeset(configuration, attrs) do
    configuration
    |> cast(attrs, [
      :source_name,
      :transport,
      :bootstrap_url,
      :ws_url,
      :poll_url,
      :proxy_url,
      :gateway_id,
      :is_active
    ])
    |> validate_required([:source_name, :transport])
    |> validate_format(:source_name, ~r/^[a-z0-9_:-]+$/i)
    |> validate_inclusion(:transport, @transports)
    |> validate_change(:bootstrap_url, &validate_optional_url/2)
    |> validate_change(:ws_url, &validate_optional_ws_url/2)
    |> validate_change(:poll_url, &validate_optional_url/2)
    |> validate_change(:proxy_url, &validate_optional_url/2)
    |> validate_transport_target()
    |> foreign_key_constraint(:gateway_id)
    |> unique_constraint(:source_name)
  end

  defp validate_optional_url(_field, nil), do: []
  defp validate_optional_url(_field, ""), do: []

  defp validate_optional_url(field, value) when is_binary(value) do
    case URI.parse(value) do
      %URI{scheme: scheme, host: host} when scheme in ["http", "https"] and is_binary(host) -> []
      _ -> [{field, "must be a valid http or https URL"}]
    end
  end

  defp validate_optional_ws_url(_field, nil), do: []
  defp validate_optional_ws_url(_field, ""), do: []

  defp validate_optional_ws_url(field, value) when is_binary(value) do
    case URI.parse(value) do
      %URI{scheme: scheme, host: host} when scheme in ["ws", "wss"] and is_binary(host) -> []
      _ -> [{field, "must be a valid ws or wss URL"}]
    end
  end

  defp validate_transport_target(changeset) do
    case get_field(changeset, :transport) do
      "websocket" ->
        changeset
        |> validate_required([:ws_url])
        |> put_change(:poll_url, nil_if_blank(get_field(changeset, :poll_url)))

      "polling" ->
        changeset
        |> validate_required([:poll_url])
        |> put_change(:ws_url, nil_if_blank(get_field(changeset, :ws_url)))

      _ ->
        changeset
    end
  end

  defp nil_if_blank(nil), do: nil
  defp nil_if_blank(""), do: nil
  defp nil_if_blank(value), do: value
end
