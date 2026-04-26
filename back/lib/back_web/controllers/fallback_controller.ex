defmodule BackWeb.FallbackController do
  use BackWeb, :controller
  alias BackWeb.JsonHelpers

  def call(conn, {:error, :not_found}) do
    conn |> put_status(:not_found) |> json(%{error: "not found"})
  end

  def call(conn, {:error, :unauthorized}) do
    conn |> put_status(:unauthorized) |> json(%{error: "unauthorized"})
  end

  def call(conn, {:error, :forbidden}) do
    conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
  end

  def call(conn, {:error, :invalid_credentials}) do
    conn |> put_status(:unauthorized) |> json(%{error: "invalid email or password"})
  end

  def call(conn, {:error, :inactive}) do
    conn |> put_status(:forbidden) |> json(%{error: "account is inactive"})
  end

  def call(conn, {:error, :insufficient_balance}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "insufficient balance"})
  end

  def call(conn, {:error, :insufficient_available_balance}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "insufficient available balance"})
  end

  def call(conn, {:error, :betting_locked}) do
    conn |> put_status(:forbidden) |> json(%{error: "betting is locked for this user"})
  end

  def call(conn, {:error, :payments_locked}) do
    conn |> put_status(:forbidden) |> json(%{error: "payments are locked for this user"})
  end

  def call(conn, {:error, :wallet_managed_by_master_admin}) do
    conn
    |> put_status(:forbidden)
    |> json(%{error: "wallet is managed by your master admin"})
  end

  def call(conn, {:error, :payment_method_not_found}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "payment method not found"})
  end

  def call(conn, {:error, :payment_method_inactive}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "payment method is inactive"})
  end

  def call(conn, {:error, :payment_method_unavailable_for_flow}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "payment method is not enabled for this request type"})
  end

  def call(conn, {:error, :payment_method_provider_conflict}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "a payment method with this provider and method name already exists"})
  end

  def call(conn, {:error, :match_mapping_suggestion_not_found}) do
    conn
    |> put_status(:not_found)
    |> json(%{error: "match mapping suggestion not found"})
  end

  def call(conn, {:error, :canonical_match_not_found}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "canonical match not found"})
  end

  def call(conn, {:error, :canonical_match_id_required}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "choose a canonical match before approving this link"})
  end

  def call(conn, {:error, :scraper_configuration_not_found}) do
    conn
    |> put_status(:not_found)
    |> json(%{error: "scraper configuration not found"})
  end

  def call(conn, {:error, :egress_gateway_not_found}) do
    conn
    |> put_status(:not_found)
    |> json(%{error: "egress gateway not found"})
  end

  def call(conn, {:error, :source_mapping_not_found}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "no approved 1xbet source mapping exists for this match yet"})
  end

  def call(conn, {:error, :payment_owner_not_found}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "payment owner could not be resolved"})
  end

  def call(conn, {:error, :approval_owner_insufficient_balance}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{
      error:
        "Deposit cannot be submitted right now because your account manager does not have enough available balance. Use the support contact shown below if you need help."
    })
  end

  def call(conn, {:error, :receipt_required}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "deposit receipt is required"})
  end

  def call(conn, {:error, :withdrawal_account_title_required}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "enter the account title for this withdrawal method"})
  end

  def call(conn, {:error, :withdrawal_account_number_required}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "enter the account number or wallet number for this withdrawal method"})
  end

  def call(conn, {:error, :unsupported_receipt_type}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "receipt file type is not supported"})
  end

  def call(conn, {:error, :receipt_too_large}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "receipt file is too large"})
  end

  def call(conn, {:error, :unsupported_logo_type}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "logo file type is not supported"})
  end

  def call(conn, {:error, :logo_too_large}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "logo file is too large"})
  end

  def call(conn, {:error, :logo_not_found}) do
    conn |> put_status(:not_found) |> json(%{error: "logo not found"})
  end

  def call(conn, {:error, :receipt_not_found}) do
    conn |> put_status(:not_found) |> json(%{error: "receipt not found"})
  end

  def call(conn, {:error, :not_a_pending_deposit}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "not a pending deposit"})
  end

  def call(conn, {:error, :stake_limit_exceeded}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "stake limit exceeded"})
  end

  def call(conn, {:error, :odds_stake_limit_exceeded}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "odds stake limit exceeded"})
  end

  def call(conn, {:error, :payout_limit_exceeded}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "payout limit exceeded"})
  end

  def call(conn, {:error, :daily_exposure_exceeded}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "daily exposure limit exceeded"})
  end

  def call(conn, {:error, :session_revoked}) do
    conn |> put_status(:unauthorized) |> json(%{error: "session revoked"})
  end

  def call(conn, {:error, :invalid_model}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "invalid model"})
  end

  def call(conn, {:error, :invalid_api_key}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "invalid api key"})
  end

  def call(conn, {:error, :invalid_settings_payload}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "invalid settings payload"})
  end

  def call(conn, {:error, :landing_whatsapp_phone_required}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{
      error: "Enter a WhatsApp number before enabling the landing launcher."
    })
  end

  def call(conn, {:error, :assistant_invalid_document_type}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "assistant document must be a markdown (.md) file"})
  end

  def call(conn, {:error, :assistant_invalid_message}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "assistant message cannot be empty"})
  end

  def call(conn, {:error, :invalid_hardness}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "invalid hardness"})
  end

  def call(conn, {:error, :match_generation_window_expired}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "match generation window expired"})
  end

  def call(conn, {:error, :invalid_initial_balance}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "initial balance must be zero or greater"})
  end

  def call(conn, {:error, :invalid_account_currency}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "invalid account currency"})
  end

  def call(conn, {:error, :invalid_phone_number}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{
      error:
        "Enter a valid phone number linked to your account, or use your email address instead."
    })
  end

  def call(conn, {:error, :invalid_email}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{
      error:
        "Enter a valid email address linked to your account, or use your phone number instead."
    })
  end

  def call(conn, {:error, :missing_lookup_identifier}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{
      error:
        "Enter either your phone number or your email address to find the correct reset support contact."
    })
  end

  def call(conn, {:error, :account_currency_not_enabled}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "account currency is not enabled"})
  end

  def call(conn, {:error, :player_currency_must_match_master_admin}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "player account currency must match the master admin account currency"})
  end

  def call(conn, {:error, :at_least_one_currency_required}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "at least one account currency must remain enabled"})
  end

  def call(conn, {:error, :invalid_provider_payload}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "invalid provider payload"})
  end

  def call(conn, {:error, :password_confirmation_mismatch}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "password confirmation does not match"})
  end

  def call(conn, {:error, :invalid_or_expired_reset_token}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "invalid or expired reset token"})
  end

  def call(conn, {:error, :unknown_provider}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "unknown provider"})
  end

  def call(conn, {:error, :invalid_provider_key}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "invalid provider key"})
  end

  def call(conn, {:error, :provider_disabled}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "provider is disabled"})
  end

  def call(conn, {:error, :provider_not_configured}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "provider is not configured"})
  end

  def call(conn, {:error, :provider_odds_not_supported}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "provider odds are not supported for this provider"})
  end

  def call(conn, {:error, :provider_not_resolved}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "match provider could not be resolved"})
  end

  def call(conn, {:error, :provider_not_found}) do
    conn |> put_status(:not_found) |> json(%{error: "provider not found"})
  end

  def call(conn, {:error, {:provider_paused, paused_until}}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "provider is paused", paused_until: paused_until})
  end

  def call(conn, {:error, :no_draft_odds_to_publish}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "no draft odds to publish"})
  end

  def call(conn, {:error, :no_published_odds}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "no published odds"})
  end

  def call(conn, {:error, :sport_market_not_supported}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "sport/market combination not supported"})
  end

  def call(conn, {:error, :invalid_market_outcome}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "invalid market outcome for selected sport"})
  end

  def call(conn, {:error, :market_not_enabled}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "market is not enabled"})
  end

  def call(conn, {:error, :market_settlement_not_supported}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "market settlement is not supported yet"})
  end

  def call(conn, {:error, :odds_out_of_allowed_range}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "odds value is outside allowed range"})
  end

  def call(conn, {:error, :invalid_odds_value}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "invalid odds value"})
  end

  def call(conn, {:error, :invalid_margin}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "invalid margin"})
  end

  def call(conn, {:error, :invalid_tennis_scenario}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "invalid tennis simulation scenario"})
  end

  def call(conn, {:error, :invalid_simulation_payload}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "invalid simulation payload"})
  end

  def call(conn, {:error, :stale_quote}) do
    conn |> put_status(:conflict) |> json(%{error: "stale quote"})
  end

  def call(conn, {:error, :odds_not_available}) do
    conn
    |> put_status(:conflict)
    |> json(%{error: "live price unavailable"})
  end

  def call(conn, {:error, :market_suspended}) do
    conn |> put_status(:conflict) |> json(%{error: "market suspended"})
  end

  def call(conn, {:error, :manual_admin_review_required}) do
    conn |> put_status(:conflict) |> json(%{error: "manual admin review required"})
  end

  def call(conn, {:error, :stale_match_state}) do
    conn |> put_status(:conflict) |> json(%{error: "match state changed"})
  end

  def call(conn, {:error, :market_not_suspended}) do
    conn |> put_status(:conflict) |> json(%{error: "market is not suspended"})
  end

  def call(conn, {:error, :missing_system_publisher}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "missing system publisher"})
  end

  def call(conn, {:error, :in_play_not_enabled}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "in-play betting is not enabled"})
  end

  def call(conn, {:error, %Ecto.Changeset{} = changeset}) do
    errors =
      Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
        Enum.reduce(opts, msg, fn {key, val}, acc ->
          String.replace(acc, "%{#{key}}", format_error_value(val))
        end)
      end)

    conn |> put_status(:unprocessable_entity) |> json(%{errors: errors})
  end

  def call(conn, {:error, {:http_error, status, body}}) when is_integer(status) do
    conn
    |> put_status(normalize_http_status(status))
    |> json(%{error: extract_http_error_message(body)})
  end

  def call(conn, {:error, reason}) do
    conn |> put_status(:bad_request) |> json(%{error: inspect(reason)})
  end

  defp extract_http_error_message(body) when is_binary(body) do
    cond do
      String.contains?(body, "<html") ->
        "provider request failed"

      true ->
        body
    end
  end

  defp extract_http_error_message(body) when is_map(body) do
    cond do
      is_binary(body["message"]) -> body["message"]
      is_binary(body["error"]) -> body["error"]
      true -> "provider request failed"
    end
  end

  defp extract_http_error_message(_), do: "provider request failed"

  # Some upstream providers and proxies return non-RFC statuses like 523.
  # Phoenix/Plug cannot send those as-is, so map them to a safe gateway error.
  defp normalize_http_status(status) when status in 100..511, do: status
  defp normalize_http_status(_), do: :bad_gateway

  defp format_error_value(value) when is_binary(value), do: value
  defp format_error_value(value) when is_atom(value), do: Atom.to_string(value)
  defp format_error_value(value) when is_integer(value) or is_float(value), do: to_string(value)
  defp format_error_value(%Decimal{} = value), do: JsonHelpers.decimal(value)
  defp format_error_value(value), do: inspect(value)
end
