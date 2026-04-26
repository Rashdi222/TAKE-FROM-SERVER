defmodule BackWeb.Plugs.EnsurePlayer do
  @moduledoc "Halts with 403 unless the current user is any authenticated role (player, customer, master_admin, super_admin)."
  import Plug.Conn

  @valid_roles [:player, :customer, :master_admin, :super_admin]

  def init(opts), do: opts

  def call(conn, _opts) do
    case Guardian.Plug.current_resource(conn) do
      %{role: role} when role in @valid_roles -> conn
      _ -> forbidden(conn)
    end
  end

  defp forbidden(conn) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(403, Jason.encode!(%{error: "forbidden"}))
    |> halt()
  end
end
