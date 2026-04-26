defmodule BackWeb.Plugs.EnsureSuperAdmin do
  @moduledoc "Halts with 403 if the current user is not a super_admin."
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    case Guardian.Plug.current_resource(conn) do
      %{role: :super_admin} -> conn
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
