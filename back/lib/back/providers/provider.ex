defmodule Back.Providers.Provider do
  use Ecto.Schema
  import Ecto.Changeset

  @provider_names ~w(sportmonks cricketdata api_sports allsports entitysport goalserve betsapi api_tennis)

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "providers" do
    field :name, :string
    field :api_key, :string
    field :is_active, :boolean, default: false
    field :is_enabled, :boolean, default: true
    field :base_url, :string
    field :socket_url, :string
    field :auth_mode, :string
    field :headers_template, :map, default: %{}
    field :query_template, :map, default: %{}
    field :sport_scope, {:array, :string}, default: []
    field :config, :map, default: %{}

    has_many :sync_logs, Back.Providers.ProviderSyncLog
    has_many :competition_feeds, Back.Providers.CompetitionFeed

    timestamps(type: :utc_datetime)
  end

  def changeset(provider, attrs) do
    provider
    |> cast(attrs, [
      :name,
      :api_key,
      :is_active,
      :is_enabled,
      :base_url,
      :socket_url,
      :auth_mode,
      :headers_template,
      :query_template,
      :sport_scope,
      :config
    ])
    |> validate_required([:name])
    |> validate_inclusion(:name, @provider_names)
    |> validate_inclusion(:auth_mode, ["header", "query", "path", "generic"],
      message: "must be one of header, query, path, or generic"
    )
    |> unique_constraint(:name)
  end
end
