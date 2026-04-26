defmodule Back.Accounts.AccountCurrency do
  alias Back.Settings

  @supported [
    %{
      code: "PKR",
      name: "Pakistani Rupee",
      symbol: "Rs",
      flag: "🇵🇰",
      kind: "fiat"
    },
    %{
      code: "BDT",
      name: "Bangladeshi Taka",
      symbol: "৳",
      flag: "🇧🇩",
      kind: "fiat"
    },
    %{
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      flag: "🇮🇳",
      kind: "fiat"
    },
    %{
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      flag: "🇺🇸",
      kind: "fiat"
    },
    %{
      code: "USDT",
      name: "Tether USD",
      symbol: "₮",
      flag: "🪙",
      kind: "crypto"
    }
  ]

  @setting_key "enabled_account_currencies"

  def supported, do: @supported

  def supported_codes, do: Enum.map(@supported, & &1.code)

  def list_all do
    enabled_codes = MapSet.new(enabled_codes())

    Enum.map(@supported, fn currency ->
      Map.put(currency, :enabled, MapSet.member?(enabled_codes, currency.code))
    end)
  end

  def list_enabled do
    list_all()
    |> Enum.filter(& &1.enabled)
  end

  def enabled_codes do
    case Settings.get(@setting_key, nil) do
      nil ->
        supported_codes()

      codes when is_list(codes) ->
        codes
        |> Enum.map(&to_string/1)
        |> Enum.filter(&(&1 in supported_codes()))

      _ ->
        supported_codes()
    end
  end

  def valid_supported?(code) when is_binary(code), do: code in supported_codes()
  def valid_supported?(_), do: false

  def enabled?(code) when is_binary(code), do: code in enabled_codes()
  def enabled?(_), do: false

  def normalize(code) when is_binary(code), do: String.upcase(String.trim(code))
  def normalize(code), do: code |> to_string() |> normalize()

  def put_enabled_codes(codes) when is_list(codes) do
    normalized =
      codes
      |> Enum.map(&normalize/1)
      |> Enum.uniq()
      |> Enum.filter(&valid_supported?/1)

    if normalized == [] do
      {:error, :at_least_one_currency_required}
    else
      Settings.put(@setting_key, normalized)
    end
  end
end
