defmodule BackWeb.ReportController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Analytics
  alias Back.Auth.Guardian
  alias BackWeb.JsonHelpers

  # ── Super Admin ───────────────────────────────────────────────────────────────

  def platform_stats(conn, params) do
    opts = parse_range(params)
    json(conn, %{data: JsonHelpers.json_safe(Analytics.get_platform_stats(opts))})
  end

  def daily(conn, params) do
    date = parse_date(params["date"])
    json(conn, %{data: JsonHelpers.json_safe(Analytics.daily_report(date))})
  end

  def weekly(conn, _params) do
    json(conn, %{data: JsonHelpers.json_safe(Analytics.weekly_report())})
  end

  def monthly(conn, _params) do
    json(conn, %{data: JsonHelpers.json_safe(Analytics.monthly_report())})
  end

  def all_master_admins(conn, params) do
    opts = parse_range(params)
    json(conn, %{data: JsonHelpers.json_safe(Analytics.get_all_master_admin_reports(opts))})
  end

  def cricket_quote_calibration(conn, params) do
    opts =
      parse_range(params)
      |> Keyword.put(:limit, parse_limit(params["limit"]))

    json(conn, %{data: JsonHelpers.json_safe(Analytics.cricket_quote_calibration_report(opts))})
  end

  # ── Master Admin ──────────────────────────────────────────────────────────────

  def master_admin_report(conn, params) do
    user = Guardian.Plug.current_resource(conn)
    # super admin can pass ?master_admin_id=X, master admin sees own report
    id = params["master_admin_id"] || user.id
    opts = parse_range(params)
    json(conn, %{data: JsonHelpers.json_safe(Analytics.get_master_admin_report(id, opts))})
  end

  # ── Player Ledger ─────────────────────────────────────────────────────────────

  def player_ledger(conn, params) do
    user = Guardian.Plug.current_resource(conn)
    # super admin can query any player; player sees own ledger
    target = params["user_id"] || user.id
    opts = parse_range(params)

    types =
      case params["types"] do
        nil -> nil
        t -> Enum.map(String.split(t, ","), &String.to_existing_atom(String.trim(&1)))
      end

    opts = if types, do: Keyword.put(opts, :types, types), else: opts
    json(conn, %{data: JsonHelpers.json_safe(Analytics.get_player_ledger(target, opts))})
  end

  # ── Helpers ───────────────────────────────────────────────────────────────────

  defp parse_range(params) do
    []
    |> then(fn o ->
      case params["from"] do
        nil -> o
        v -> Keyword.put(o, :from, parse_datetime(v))
      end
    end)
    |> then(fn o ->
      case params["account_currency"] do
        nil -> o
        v -> Keyword.put(o, :account_currency, String.upcase(String.trim(v)))
      end
    end)
    |> then(fn o ->
      case params["to"] do
        nil -> o
        v -> Keyword.put(o, :to, parse_datetime(v))
      end
    end)
  end

  defp parse_datetime(str) do
    case DateTime.from_iso8601(str) do
      {:ok, dt, _} -> dt
      _ -> nil
    end
  end

  defp parse_date(nil), do: Date.utc_today()

  defp parse_date(str) do
    case Date.from_iso8601(str) do
      {:ok, d} -> d
      _ -> Date.utc_today()
    end
  end

  defp parse_limit(nil), do: 60

  defp parse_limit(value) do
    case Integer.parse(to_string(value)) do
      {int, _} when int > 0 and int <= 500 -> int
      _ -> 60
    end
  end
end
