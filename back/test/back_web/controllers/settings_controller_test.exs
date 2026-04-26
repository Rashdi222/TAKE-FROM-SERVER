defmodule BackWeb.SettingsControllerTest do
  use BackWeb.ConnCase, async: true

  alias Back.Accounts.User
  alias Back.Auth.Guardian
  alias Back.Repo
  alias Back.Settings

  test "sets openrouter model", %{conn: conn} do
    conn =
      conn
      |> auth_conn()
      |> post(~p"/api/super-admin/settings/openrouter/model", %{"model" => "openai/gpt-4o-mini"})

    assert %{"data" => %{"openrouter_active_model" => "openai/gpt-4o-mini"}} =
             json_response(conn, 200)

    assert Settings.get("openrouter_active_model") == "openai/gpt-4o-mini"
  end

  test "rejects empty openrouter model", %{conn: conn} do
    conn =
      conn
      |> auth_conn()
      |> post(~p"/api/super-admin/settings/openrouter/model", %{"model" => ""})

    assert %{"error" => "invalid model"} = json_response(conn, 422)
  end

  test "sets openrouter key", %{conn: conn} do
    conn =
      conn
      |> auth_conn()
      |> post(~p"/api/super-admin/settings/openrouter/key", %{"api_key" => "sk-test-xyz"})

    assert %{"message" => "openrouter key saved"} = json_response(conn, 200)
    assert Settings.get("openrouter_api_key") == "sk-test-xyz"
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
