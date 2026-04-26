defmodule Back.SportsProviders.Behaviour do
  @type normalized_event :: %{
          required(:provider) => :api_tennis | :goalserve | :betsapi,
          required(:provider_event_id) => String.t(),
          required(:sport) => :tennis | :horse_racing | :greyhound,
          required(:competition_name) => String.t(),
          required(:status) => :scheduled | :live | :finished | :cancelled | :unknown,
          required(:start_time_utc) => DateTime.t() | nil,
          required(:participants) => [map()],
          optional(:result) => map() | nil,
          required(:raw) => map()
        }

  @callback fetch_fixtures(keyword() | map()) :: {:ok, [normalized_event()]} | {:error, term()}
  @callback fetch_live(keyword() | map()) :: {:ok, [normalized_event()]} | {:error, term()}
end
