defmodule Back.AI.OddsOrchestrator do
  @moduledoc """
  Multi-step, sport-aware orchestration loop for AI odds generation.
  """

  alias Back.AI.OddsRuntime
  alias Back.AI.OddsRules
  alias Back.Settings

  @max_steps 5
  @allowed_hardness ~w(easy medium hard)
  @openrouter_url "https://openrouter.ai/api/v1/chat/completions"

  def run(match, params \\ %{}) when is_map(params) do
    with :ok <- OddsRuntime.ensure_generation_allowed(match),
         {:ok, ctx} <- decode_context_token(params["context_token"]),
         merged <- merge_answers(ctx["answers"] || %{}, params["answers"] || %{}, params),
         step <- (ctx["step"] || 0) + 1,
         state <- %{"answers" => merged, "step" => step, "sport" => to_string(match.sport)} do
      missing = missing_fields(match, merged)
      plan = build_plan(match, merged, params)

      cond do
        missing == [] ->
          {:ready,
           %{
             step: step,
             context_token: nil,
             sport_profile: OddsRuntime.sport_profile(match.sport),
             plan: plan,
             collected_answers: merged
           }}

        step >= @max_steps ->
          {:ready,
           %{
             step: step,
             context_token: nil,
             sport_profile: OddsRuntime.sport_profile(match.sport),
             plan: plan,
             collected_answers: merged,
             note: "Max orchestration steps reached; defaults applied for missing values."
           }}

        true ->
          questions = build_follow_up_questions(match, merged, missing, step, plan)

          {:needs_input,
           %{
             step: step,
             context_token: encode_context_token(state),
             sport_profile: OddsRuntime.sport_profile(match.sport),
             missing_fields: missing,
             questions: questions,
             collected_answers: merged,
             preview_plan: Map.drop(plan, [:market_limits])
           }}
      end
    end
  end

  defp missing_fields(match, answers) do
    []
    |> maybe_missing(:bet_types, normalized_bet_types(answers["bet_types"], match.sport))
    |> maybe_missing(:hardness, normalized_hardness(answers["hardness"]))
  end

  defp maybe_missing(acc, _field, value) when value not in [nil, []], do: acc
  defp maybe_missing(acc, field, _value), do: acc ++ [field]

  defp build_plan(match, answers, params) do
    bet_types =
      normalized_bet_types(answers["bet_types"], match.sport) ||
        OddsRules.allowed_bet_types(match.sport)

    hardness = normalized_hardness(answers["hardness"]) || :medium
    admin_note = normalized_admin_note(answers["admin_note"])
    default_max_stake_amount = normalize_decimal_input(answers["default_max_stake_amount"])
    default_max_payout_amount = normalize_decimal_input(answers["default_max_payout_amount"])
    limit_scope = normalized_limit_scope(answers["limit_scope"]) || :market
    market_limits = normalized_market_limits(answers["market_limits"], match.sport)

    model_policy = model_policy(answers, params)

    %{
      sport: match.sport,
      bet_types: bet_types,
      hardness: hardness,
      admin_note: admin_note,
      model: model_policy.generation_model,
      planning_model: model_policy.planning_model,
      generation_model: model_policy.generation_model,
      validation_model: model_policy.validation_model,
      default_max_stake_amount: default_max_stake_amount,
      default_max_payout_amount: default_max_payout_amount,
      limit_scope: limit_scope,
      market_limits: market_limits
    }
  end

  defp build_follow_up_questions(match, answers, missing, step, plan) do
    default = default_questions(match, answers, missing)

    case ai_follow_up_questions(match, answers, missing, step, plan.planning_model) do
      {:ok, []} -> default
      {:ok, ai_qs} -> ai_qs
      _ -> default
    end
  end

  defp default_questions(match, answers, missing) do
    sport_label = match.sport |> to_string() |> String.replace("_", " ")

    allowed_markets =
      OddsRules.allowed_bet_types(match.sport) |> Enum.map(&to_string/1) |> Enum.join(", ")

    base =
      Enum.map(missing, fn
        :bet_types ->
          %{
            key: "bet_types",
            question: "For this #{sport_label} match, which markets should be generated?",
            hint: "Allowed: #{allowed_markets}. Example: [\"match_winner\",\"over_under\"]"
          }

        :hardness ->
          %{
            key: "hardness",
            question: "Which pricing hardness should be used?",
            hint: "Allowed: easy, medium, hard."
          }
      end)

    sport_specific = OddsRuntime.sport_questions(match.sport)

    if answers["default_max_stake_amount"] in [nil, ""] do
      base ++
        sport_specific ++
        [
          %{
            key: "default_max_stake_amount",
            question: "Do you want a default max stake amount for generated odds?",
            hint: "Example: 5000"
          }
        ]
    else
      base ++ sport_specific
    end
  end

  defp ai_follow_up_questions(match, answers, missing, step, planning_model) do
    with {:ok, api_key} <- openrouter_api_key(),
         payload <- ai_questions_payload(match, answers, missing, step, planning_model),
         {:ok,
          %{status: 200, body: %{"choices" => [%{"message" => %{"content" => content}} | _]}}} <-
           Req.post(@openrouter_url,
             json: payload,
             headers: [
               {"Authorization", "Bearer #{api_key}"},
               {"HTTP-Referer", "https://sixerbat.com"},
               {"X-Title", "Sixerbat"}
             ],
             receive_timeout: 20_000
           ) do
      decode_questions(content)
    else
      _ -> {:error, :question_generation_failed}
    end
  end

  defp ai_questions_payload(match, answers, missing, step, planning_model) do
    %{
      model: planning_model || default_model(),
      temperature: 0.2,
      max_tokens: 420,
      messages: [
        %{
          role: "system",
          content:
            "You are a betting odds admin assistant. Return ONLY JSON array of objects with keys: key, question, hint."
        },
        %{
          role: "user",
          content: """
          Create concise follow-up questions for missing fields in odds generation.
          Match: #{match.sport} | #{match.team1} vs #{match.team2}
          Step: #{step}
          Missing: #{Enum.join(Enum.map(missing, &to_string/1), ",")}
          Collected answers JSON: #{Jason.encode!(answers)}
          Rules:
          - Ask at most 3 questions.
          - Each question must map to one key from this list: bet_types, hardness, admin_note, default_max_stake_amount, market_limits.
          - For football ask goal-line tuning context when relevant.
          - For horse/dog racing ask runner-spread context when relevant.
          - Output JSON array only.
          """
        }
      ]
    }
  end

  defp decode_questions(content) when is_binary(content) do
    cleaned =
      content
      |> String.trim()
      |> String.replace(~r/^```(?:json)?\n?/, "")
      |> String.replace(~r/\n?```$/, "")
      |> String.trim()

    case Jason.decode(cleaned) do
      {:ok, rows} when is_list(rows) ->
        allowed_keys = [
          "bet_types",
          "hardness",
          "admin_note",
          "default_max_stake_amount",
          "market_limits"
        ]

        questions =
          rows
          |> Enum.take(3)
          |> Enum.map(fn row ->
            %{
              key: to_string(row["key"] || ""),
              question: to_string(row["question"] || ""),
              hint: to_string(row["hint"] || "")
            }
          end)
          |> Enum.filter(fn q -> q.key in allowed_keys and q.question != "" end)

        {:ok, questions}

      _ ->
        {:error, :invalid_question_payload}
    end
  end

  defp decode_questions(_), do: {:error, :invalid_question_payload}

  defp merge_answers(existing, incoming, params) do
    existing = stringify_keys(existing)
    incoming = stringify_keys(incoming)

    params_projected =
      %{}
      |> put_if_present("bet_types", params["bet_types"])
      |> put_if_present("hardness", params["hardness"])
      |> put_if_present("admin_note", params["admin_note"])
      |> put_if_present("model", params["model"])
      |> put_if_present("planning_model", params["planning_model"])
      |> put_if_present("generation_model", params["generation_model"])
      |> put_if_present("validation_model", params["validation_model"])
      |> put_if_present("default_max_stake_amount", params["default_max_stake_amount"])
      |> put_if_present("default_max_payout_amount", params["default_max_payout_amount"])
      |> put_if_present("limit_scope", params["limit_scope"])
      |> put_if_present("market_limits", params["market_limits"])

    existing
    |> Map.merge(params_projected)
    |> Map.merge(incoming)
  end

  defp put_if_present(map, _key, nil), do: map
  defp put_if_present(map, key, value), do: Map.put(map, key, value)

  defp stringify_keys(map) when is_map(map) do
    map
    |> Enum.map(fn {k, v} -> {to_string(k), v} end)
    |> Enum.into(%{})
  end

  defp stringify_keys(_), do: %{}

  defp normalized_bet_types(nil, sport), do: OddsRules.allowed_bet_types(sport)

  defp normalized_bet_types(v, sport) when is_binary(v) do
    v
    |> String.split(",", trim: true)
    |> Enum.map(&String.trim/1)
    |> normalized_bet_types(sport)
  end

  defp normalized_bet_types(v, sport) when is_list(v) do
    allowed = OddsRules.allowed_bet_types(sport) |> Enum.map(&to_string/1)

    v
    |> Enum.map(&normalize_binary/1)
    |> Enum.reject(&is_nil/1)
    |> Enum.map(&String.downcase/1)
    |> Enum.filter(&(&1 in allowed))
    |> Enum.uniq()
    |> Enum.map(&string_to_bet_type/1)
    |> Enum.reject(&is_nil/1)
    |> case do
      [] -> nil
      values -> values
    end
  end

  defp normalized_bet_types(_, _), do: nil

  defp normalized_hardness(nil), do: nil

  defp normalized_hardness(v) do
    val = v |> to_string() |> String.trim() |> String.downcase()
    if val in @allowed_hardness, do: string_to_hardness(val), else: nil
  end

  defp normalized_admin_note(nil), do: nil

  defp normalized_admin_note(v) do
    case normalize_binary(v) do
      nil -> nil
      value -> String.slice(value, 0, 500)
    end
  end

  defp normalized_market_limits(nil, _sport), do: []

  defp normalized_market_limits(v, sport) when is_binary(v) do
    case Jason.decode(v) do
      {:ok, parsed} -> normalized_market_limits(parsed, sport)
      _ -> []
    end
  end

  defp normalized_market_limits(v, sport) when is_list(v) do
    allowed = OddsRules.allowed_bet_types(sport)

    v
    |> Enum.filter(&is_map/1)
    |> Enum.map(fn row ->
      bet_type = string_to_bet_type(normalize_binary(row["bet_type"] || row[:bet_type]) || "")

      if bet_type in allowed do
        %{
          bet_type: bet_type,
          outcome: normalize_binary(row["outcome"] || row[:outcome]),
          max_stake_amount:
            normalize_decimal_input(row["max_stake_amount"] || row[:max_stake_amount]),
          max_payout_amount:
            normalize_decimal_input(row["max_payout_amount"] || row[:max_payout_amount]),
          limit_scope:
            normalized_limit_scope(row["limit_scope"] || row[:limit_scope]) || :selection
        }
      else
        nil
      end
    end)
    |> Enum.reject(&is_nil/1)
  end

  defp normalized_market_limits(_, _sport), do: []

  defp normalized_limit_scope(nil), do: nil

  defp normalized_limit_scope(v) do
    case v |> to_string() |> String.trim() |> String.downcase() do
      "global" -> :global
      "market" -> :market
      "selection" -> :selection
      _ -> nil
    end
  end

  defp normalize_decimal_input(nil), do: nil

  defp normalize_decimal_input(v) when is_integer(v), do: Integer.to_string(v)
  defp normalize_decimal_input(v) when is_float(v), do: :erlang.float_to_binary(v, decimals: 2)

  defp normalize_decimal_input(v) when is_binary(v) do
    trimmed = String.trim(v)

    case Decimal.parse(trimmed) do
      {%Decimal{} = d, ""} ->
        if Decimal.compare(d, 0) == :gt, do: trimmed, else: nil

      _ ->
        nil
    end
  end

  defp normalize_decimal_input(_), do: nil

  defp normalize_binary(v) when is_binary(v) do
    trimmed = String.trim(v)
    if trimmed == "", do: nil, else: trimmed
  end

  defp normalize_binary(v) when is_atom(v), do: v |> Atom.to_string() |> normalize_binary()
  defp normalize_binary(_), do: nil

  defp model_policy(answers, params) do
    planning_model =
      normalize_binary(params["planning_model"]) ||
        normalize_binary(answers["planning_model"]) ||
        normalize_binary(Settings.get("openrouter_planning_model", nil)) ||
        default_model()

    generation_model =
      normalize_binary(params["generation_model"]) ||
        normalize_binary(params["model"]) ||
        normalize_binary(answers["generation_model"]) ||
        normalize_binary(answers["model"]) ||
        normalize_binary(Settings.get("openrouter_generation_model", nil)) ||
        default_model()

    validation_model =
      normalize_binary(params["validation_model"]) ||
        normalize_binary(answers["validation_model"]) ||
        normalize_binary(Settings.get("openrouter_validation_model", nil))

    %{
      planning_model: planning_model,
      generation_model: generation_model,
      validation_model: validation_model
    }
  end

  defp string_to_bet_type("match_winner"), do: :match_winner
  defp string_to_bet_type("over_under"), do: :over_under
  defp string_to_bet_type("in_play"), do: :in_play
  defp string_to_bet_type("double_chance"), do: :double_chance
  defp string_to_bet_type("btts"), do: :btts
  defp string_to_bet_type("set_betting"), do: :set_betting
  defp string_to_bet_type("place"), do: :place
  defp string_to_bet_type(_), do: nil

  defp string_to_hardness("easy"), do: :easy
  defp string_to_hardness("medium"), do: :medium
  defp string_to_hardness("hard"), do: :hard
  defp string_to_hardness(_), do: nil

  defp encode_context_token(state),
    do: state |> Jason.encode!() |> Base.url_encode64(padding: false)

  defp decode_context_token(nil), do: {:ok, %{}}
  defp decode_context_token(""), do: {:ok, %{}}

  defp decode_context_token(token) when is_binary(token) do
    with {:ok, decoded} <- Base.url_decode64(token, padding: false),
         {:ok, map} <- Jason.decode(decoded),
         true <- is_map(map) do
      {:ok, map}
    else
      _ -> {:ok, %{}}
    end
  end

  defp openrouter_api_key do
    key_from_settings = Settings.get("openrouter_api_key", nil)
    key_from_env = Application.get_env(:back, :openrouter_api_key)
    key = key_from_settings || key_from_env

    if is_binary(key) and byte_size(String.trim(key)) > 0 do
      {:ok, key}
    else
      {:error, :openrouter_api_key_not_configured}
    end
  end

  defp default_model do
    Settings.get(
      "openrouter_active_model",
      Application.get_env(:back, :openrouter_default_model, "openai/gpt-4o-mini")
    )
  end
end
