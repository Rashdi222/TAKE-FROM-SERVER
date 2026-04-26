defmodule Back.AI.OddsGenerator do
  @moduledoc """
  OpenRouter AI client for generating betting odds.
  Supports match_winner, over_under, and in_play bet types
  for cricket and tennis with configurable hardness levels.
  """

  @openrouter_url "https://openrouter.ai/api/v1/chat/completions"
  alias Back.AI.OddsRules
  alias Back.AI.OddsRuntime
  alias Back.Settings

  @hardness_ranges %{
    easy: %{min: 1.20, max: 2.50},
    medium: %{min: 1.50, max: 3.50},
    hard: %{min: 1.80, max: 6.00}
  }

  @doc """
  Generates odds for a match.

  ## Params
    - match: %Match{} struct with sport, team1, team2
    - bet_types: list of :match_winner | :over_under | :in_play
    - opts: [hardness: :easy | :medium | :hard, model: "openai/gpt-4o"]

  ## Returns
    {:ok, [%{bet_type, outcome, odds_value}]} | {:error, reason}
  """
  def generate_odds(match, bet_types, opts \\ []) do
    with {:ok, runtime} <- OddsRuntime.build_generation_context(match, bet_types, opts) do
      model = Keyword.get(opts, :model, default_model())
      hardness = Keyword.get(opts, :hardness, :medium)
      admin_note = Keyword.get(opts, :admin_note)
      range = Map.fetch!(@hardness_ranges, hardness)
      prompt = build_prompt(match, runtime, hardness, range, admin_note)

      case call_openrouter(prompt, model) do
        {:ok, content} -> parse_response(content, match, runtime, model)
        {:error, _} = err -> err
      end
    end
  end

  # ── Prompt Engineering ────────────────────────────────────────────────────────

  defp build_prompt(match, runtime, hardness, range, admin_note) do
    strategy = runtime.strategy

    bet_type_instructions =
      Enum.map_join(runtime.effective_bet_types, "\n", &strategy.bet_type_instruction(&1, match))

    market_bounds =
      runtime.market_configs
      |> Enum.map(fn {bet_type, config} ->
        bounds =
          if config do
            "#{config.default_min_odds}-#{config.default_max_odds}"
          else
            "#{range.min}-#{range.max}"
          end

        "- #{bet_type}: target odds bounds #{bounds}"
      end)
      |> Enum.join("\n")

    admin_note_block =
      if is_binary(admin_note) and String.trim(admin_note) != "",
        do: "\nADMIN NOTE:\n- #{admin_note}\n",
        else: ""

    """
    You are a professional sports betting odds compiler. Generate realistic betting odds for the following match.

    MATCH DETAILS:
    - Sport: #{match.sport}
    - Team 1: #{match.team1}
    - Team 2: #{match.team2}
    - Match Phase: #{runtime.phase}
    - Hardness Level: #{hardness} (odds range: #{range.min} to #{range.max})
    - Sport Guidance: #{runtime.sport_profile.notes}

    REQUIRED BET TYPES:
    #{bet_type_instructions}
    #{admin_note_block}
    MARKET BOUNDS:
    #{market_bounds}

    STRICT RULES:
    1. Return ONLY a valid JSON array. No explanation, no markdown, no code blocks.
    2. Each object must have exactly: "bet_type", "outcome", "odds_value"
    3. odds_value must be a number between #{range.min} and #{range.max}
    4. #{strategy.match_winner_rule(match)}
    5. Odds must be realistic — the sum of implied probabilities (1/odds) should be between 1.05 and 1.15
    6. Never return odds below 1.01 or above 20.0

    EXAMPLE OUTPUT FORMAT:
    [{"bet_type":"match_winner","outcome":"#{match.team1}","odds_value":1.85},{"bet_type":"match_winner","outcome":"#{match.team2}","odds_value":2.10}]
    """
  end

  # ── OpenRouter HTTP Client ────────────────────────────────────────────────────

  defp call_openrouter(prompt, model) do
    api_key =
      Settings.get("openrouter_api_key", Application.get_env(:back, :openrouter_api_key, ""))

    if api_key in [nil, ""] do
      {:error, :openrouter_api_key_not_configured}
    else
      body = %{
        model: model,
        messages: [
          %{
            role: "system",
            content:
              "You are a JSON-only betting odds generator. You never output anything except valid JSON arrays."
          },
          %{role: "user", content: prompt}
        ],
        temperature: 0.3,
        max_tokens: 1000
      }

      case Req.post(@openrouter_url,
             json: body,
             headers: [
               {"Authorization", "Bearer #{api_key}"},
               {"HTTP-Referer", "https://sixerbat.com"},
               {"X-Title", "Sixerbat"}
             ],
             receive_timeout: 30_000
           ) do
        {:ok, %{status: 200, body: %{"choices" => [%{"message" => %{"content" => content}} | _]}}} ->
          {:ok, content}

        {:ok, %{status: status, body: body}} ->
          {:error, "OpenRouter error #{status}: #{inspect(body)}"}

        {:error, reason} ->
          {:error, "HTTP error: #{inspect(reason)}"}
      end
    end
  end

  # ── Response Parsing & Validation ────────────────────────────────────────────

  defp parse_response(content, match, runtime, model) do
    # Strip any accidental markdown fences
    cleaned = content |> String.trim() |> strip_markdown_fences()

    case Jason.decode(cleaned) do
      {:ok, items} when is_list(items) ->
        odds =
          items
          |> Enum.flat_map(&validate_odds_item(&1, match, runtime, model))
          |> Enum.reject(&is_nil/1)

        if odds == [], do: {:error, :no_valid_odds_returned}, else: {:ok, odds}

      {:ok, _} ->
        {:error, :invalid_ai_response_format}

      {:error, _} ->
        {:error, :ai_response_not_valid_json}
    end
  end

  defp validate_odds_item(
         %{"bet_type" => bt, "outcome" => outcome, "odds_value" => val},
         match,
         runtime,
         model
       )
       when is_binary(bt) and is_binary(outcome) do
    odds_val = to_decimal(val)
    bet_type = string_to_bet_type(bt)

    if (bet_type in runtime.effective_bet_types and odds_val) &&
         OddsRules.validate(match, bet_type, outcome, odds_val) == :ok &&
         Decimal.compare(odds_val, Decimal.new("1.01")) != :lt &&
         Decimal.compare(odds_val, Decimal.new("20.0")) != :gt do
      [
        %{
          bet_type: bet_type,
          outcome: outcome,
          odds_value: odds_val,
          ai_generated: true,
          ai_model: model
        }
      ]
    else
      []
    end
  rescue
    ArgumentError -> []
  end

  defp validate_odds_item(_, _, _, _), do: []

  defp to_decimal(val) when is_float(val), do: Decimal.from_float(val)
  defp to_decimal(val) when is_integer(val), do: Decimal.new(val)

  defp to_decimal(val) when is_binary(val) do
    case Decimal.parse(val) do
      {d, ""} -> d
      _ -> nil
    end
  end

  defp to_decimal(_), do: nil

  defp string_to_bet_type("match_winner"), do: :match_winner
  defp string_to_bet_type("over_under"), do: :over_under
  defp string_to_bet_type("in_play"), do: :in_play
  defp string_to_bet_type("double_chance"), do: :double_chance
  defp string_to_bet_type("btts"), do: :btts
  defp string_to_bet_type("set_betting"), do: :set_betting
  defp string_to_bet_type("place"), do: :place
  defp string_to_bet_type(_), do: nil

  defp strip_markdown_fences(content) do
    content
    |> String.replace(~r/^```(?:json)?\n?/, "")
    |> String.replace(~r/\n?```$/, "")
    |> String.trim()
  end

  defp default_model do
    Settings.get(
      "openrouter_active_model",
      Application.get_env(:back, :openrouter_default_model, "openai/gpt-4o-mini")
    )
  end
end
