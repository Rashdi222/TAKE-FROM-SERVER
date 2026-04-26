defmodule Back.AI.OddsStrategy do
  @callback sport() :: atom()
  @callback profile() :: map()
  @callback match_winner_rule(match :: map()) :: String.t()
  @callback bet_type_instruction(bet_type :: atom(), match :: map()) :: String.t()
  @callback follow_up_questions() :: [map()]
end
