defmodule Back.FeatureFlags do
  @moduledoc false

  def canonical_live_trading_enabled? do
    Application.get_env(:back, :enable_canonical_live_trading, false) == true
  end

  def multi_source_arbiter_enabled? do
    Application.get_env(:back, :multi_source_arbiter_enabled, false) == true
  end
end
