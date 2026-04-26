defmodule BackWeb.ProviderControllerTest do
  use BackWeb.ConnCase, async: true

  alias Back.Accounts.User
  alias Back.Auth.Guardian
  alias Back.Repo

  test "lists providers for super admin", %{conn: conn} do
    conn = auth_conn(conn)
    conn = get(conn, ~p"/api/super-admin/providers")

    assert %{"data" => _} = json_response(conn, 200)
  end

  test "upserts provider config", %{conn: conn} do
    conn =
      conn
      |> auth_conn()
      |> post(~p"/api/super-admin/providers", %{
        "name" => "sportmonks",
        "api_key" => "secret-key",
        "base_url" => "https://api.sportmonks.com/v3/cricket",
        "config" => %{"live_endpoint" => "/livescores"}
      })

    body = json_response(conn, 201)
    assert body["data"]["name"] == "sportmonks"
    assert body["data"]["has_api_key"] == true
  end

  test "rejects invalid provider payload", %{conn: conn} do
    conn =
      conn
      |> auth_conn()
      |> post(~p"/api/super-admin/providers", %{"base_url" => "https://example.com"})

    assert %{"error" => "invalid provider payload"} = json_response(conn, 422)
  end

  defp auth_conn(conn) do
    user = super_admin_fixture()
    {:ok, token, _claims} = Guardian.generate_access_token(user)
    put_req_header(conn, "authorization", "Bearer " <> token)
  end

  defp super_admin_fixture do
    email = "sa_" <> Integer.to_string(System.unique_integer([:positive])) <> "@example.com"

    %User{}
    |> User.registration_changeset(%{
      "email" => email,
      "password" => "password123",
      "role" => "super_admin"
    })
    |> Repo.insert!()
  end
end
