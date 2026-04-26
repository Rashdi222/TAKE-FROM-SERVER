defmodule Back.Providers.Behaviour do
  @type normalized_match :: %{
          required(:external_id) => String.t(),
          required(:provider) => String.t(),
          required(:sport) => String.t() | atom(),
          required(:team1) => String.t(),
          required(:team2) => String.t(),
          required(:start_time) => DateTime.t() | NaiveDateTime.t() | String.t(),
          required(:status) => String.t() | atom(),
          optional(:score) => map(),
          optional(:raw) => map(),
          optional(:live_state_version) => integer(),
          optional(:current_innings) => integer(),
          optional(:current_over) => Decimal.t() | integer() | float() | String.t(),
          optional(:current_ball_in_over) => integer(),
          optional(:batting_team) => String.t(),
          optional(:bowling_team) => String.t(),
          optional(:runs_total) => integer(),
          optional(:wickets_total) => integer(),
          optional(:target_runs) => integer(),
          optional(:required_run_rate) => Decimal.t() | integer() | float() | String.t(),
          optional(:current_run_rate) => Decimal.t() | integer() | float() | String.t(),
          optional(:market_state) => map(),
          optional(:last_ball_event_type) => String.t()
        }

  @callback fetch_fixtures(config :: map()) :: {:ok, [map()]} | {:error, term()}
  @callback fetch_live(config :: map()) :: {:ok, [map()]} | {:error, term()}
  @callback fetch_fixtures_for_feed(config :: map(), feed :: map()) ::
              {:ok, [map()]} | {:error, term()}
  @callback fetch_live_for_feed(config :: map(), feed :: map()) ::
              {:ok, [map()]} | {:error, term()}
  @callback fetch_odds_for_match(config :: map(), match :: map()) ::
              {:ok, [map()]} | {:error, term()}
  @callback normalize(raw :: map()) :: normalized_match()
end
