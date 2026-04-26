defmodule Back.Accounts.PhoneLookup do
  @moduledoc false

  import Ecto.Query

  alias Back.Accounts.User
  alias Back.Repo

  def find_user_by_phone(phone_number) when is_binary(phone_number) do
    normalized = normalize(phone_number)
    candidates = variants(normalized)

    from(u in User,
      where: u.role in [:player, :customer],
      where:
        fragment(
          "regexp_replace(coalesce(?, ''), '\\D', '', 'g') = ANY(?)",
          u.phone_number,
          ^candidates
        ),
      order_by: [desc: u.inserted_at],
      limit: 1
    )
    |> Repo.one()
  end

  def normalize(phone_number) when is_binary(phone_number) do
    phone_number
    |> String.replace(~r/\D/u, "")
    |> String.trim()
  end

  def valid_lookup_phone?(phone_number) when is_binary(phone_number) do
    normalized = normalize(phone_number)
    length = byte_size(normalized)
    length >= 10 and length <= 15
  end

  def variants(""), do: []

  def variants(digits) do
    digits
    |> candidate_forms()
    |> Enum.reject(&(&1 == ""))
    |> Enum.uniq()
  end

  defp candidate_forms("92" <> rest = digits) when byte_size(rest) == 10 do
    [digits, "0" <> rest, rest]
  end

  defp candidate_forms("0" <> rest = digits) when byte_size(rest) == 10 do
    [digits, "92" <> rest, rest]
  end

  defp candidate_forms(digits) when byte_size(digits) == 10 do
    [digits, "0" <> digits, "92" <> digits]
  end

  defp candidate_forms(digits), do: [digits]
end
