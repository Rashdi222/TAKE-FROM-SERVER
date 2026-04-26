defmodule Back.Cricket.Sportsmonks.Normalizers.VenueNormalizer do
  @moduledoc false

  @spec normalize(map()) :: map()
  def normalize(raw) when is_map(raw) do
    %{
      "venue" => normalize_venue(raw["venue"] || %{}),
      "officials" => %{
        "first_umpire" => normalize_person(raw["firstumpire"]),
        "second_umpire" => normalize_person(raw["secondumpire"]),
        "tv_umpire" => normalize_person(raw["tvumpire"]),
        "referee" => normalize_person(raw["referee"])
      },
      "awards" => %{
        "man_of_match" => normalize_person(raw["manofmatch"]),
        "man_of_series" => normalize_person(raw["manofseries"])
      }
    }
  end

  def normalize(_), do: normalize(%{})

  defp normalize_venue(venue) when is_map(venue) do
    %{
      "id" => venue["id"],
      "name" => present_string(venue["name"]),
      "city" => present_string(venue["city"]),
      "country" => present_string(venue["country"]),
      "capacity" => venue["capacity"],
      "image_path" => present_string(venue["image_path"]),
      "timezone" => present_string(venue["timezone"])
    }
  end

  defp normalize_venue(_), do: %{}

  defp normalize_person(person) when is_map(person) do
    %{
      "id" => person["id"],
      "fullname" => present_string(person["fullname"] || person["name"]),
      "country_id" => person["country_id"],
      "image_path" => present_string(person["image_path"]),
      "position" => present_string(person["position"])
    }
    |> Enum.reject(fn {_key, value} -> is_nil(value) end)
    |> Map.new()
  end

  defp normalize_person(_), do: nil

  defp present_string(value) when is_binary(value) do
    case String.trim(value) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  defp present_string(_), do: nil
end
