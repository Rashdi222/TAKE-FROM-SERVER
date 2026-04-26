defmodule Back.Betting.MatchSlug do
  import Ecto.Changeset

  def put_slug(changeset) do
    sport = get_field(changeset, :sport)
    team1 = get_field(changeset, :team1)
    team2 = get_field(changeset, :team2)
    start_time = get_field(changeset, :start_time)

    slug =
      [sport_label(sport), team1, "vs", team2, date_label(start_time)]
      |> Enum.reject(&empty?/1)
      |> Enum.join(" ")
      |> slugify()

    put_change(changeset, :slug, slug)
  end

  def slugify(value) when is_binary(value) do
    value
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, "-")
    |> String.trim("-")
  end

  def slugify(value), do: value |> to_string() |> slugify()

  defp sport_label(nil), do: nil
  defp sport_label(value), do: value |> to_string() |> String.replace("_", " ")

  defp date_label(%DateTime{} = dt), do: Calendar.strftime(dt, "%Y-%m-%d")
  defp date_label(%NaiveDateTime{} = dt), do: Calendar.strftime(dt, "%Y-%m-%d")
  defp date_label(_), do: nil

  defp empty?(nil), do: true
  defp empty?(value) when is_binary(value), do: String.trim(value) == ""
  defp empty?(_), do: false
end
