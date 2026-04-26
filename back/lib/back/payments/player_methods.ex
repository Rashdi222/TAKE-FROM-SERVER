defmodule Back.Payments.PlayerMethods do
  @moduledoc false

  alias Back.Payments.PaymentMethod

  def serialize(%PaymentMethod{} = method) do
    %{
      id: method.id,
      provider: method.provider,
      method_name: method.method_name,
      is_active: method.is_active,
      supports_deposit: method.supports_deposit,
      supports_withdrawal: method.supports_withdrawal,
      logo_path: method.logo_path,
      preset_key: method.preset_key,
      label: method.method_name || default_label(method.provider),
      instructions: method.instructions,
      account_label: method.account_title,
      account_number: method.iban_or_account_number,
      bank_name: method.bank_name,
      account_label_hint: method.account_label_hint,
      account_number_label: method.account_number_label,
      account_number_placeholder: method.account_number_placeholder,
      instructions_hint: method.instructions_hint
    }
  end

  defp default_label("jazzcash"), do: "JazzCash"
  defp default_label("easypaisa"), do: "EasyPaisa"
  defp default_label("nayapay"), do: "NayaPay"
  defp default_label("ubl"), do: "UBL"
  defp default_label("hbl"), do: "HBL"
  defp default_label("meezan_bank"), do: "Meezan Bank"
  defp default_label("paytm"), do: "Paytm"
  defp default_label("phonepe"), do: "PhonePe"
  defp default_label("google_pay_india"), do: "Google Pay India"
  defp default_label("upi"), do: "UPI"
  defp default_label("skrill"), do: "Skrill"
  defp default_label("neteller"), do: "Neteller"
  defp default_label("usdt_trc20"), do: "USDT TRC20"
  defp default_label("usdt_erc20"), do: "USDT ERC20"
  defp default_label("manual"), do: "Manual Transfer"

  defp default_label(provider),
    do: provider |> to_string() |> String.replace("_", " ") |> String.capitalize()
end
