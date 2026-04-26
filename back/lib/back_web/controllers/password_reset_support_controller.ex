defmodule BackWeb.PasswordResetSupportController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Admin
  alias Back.Accounts.PasswordResetSupport
  alias Back.Auth.Guardian

  def lookup(conn, params) do
    result =
      cond do
        present?(params["phone_number"]) ->
          PasswordResetSupport.resolve_public_support_by_phone(params["phone_number"])

        present?(params["email"]) ->
          PasswordResetSupport.resolve_public_support_by_email(params["email"])

        true ->
          {:error, :missing_lookup_identifier}
      end

    with {:ok, result} <- result do
      json(conn, %{data: result})
    end
  end

  def super_admin_index(conn, _params) do
    current_user = Guardian.Plug.current_resource(conn)

    json(conn, %{
      data:
        Enum.map(
          PasswordResetSupport.list_contacts_for_owner(:super_admin, current_user.id),
          &contact_json/1
        )
    })
  end

  def master_admin_index(conn, _params) do
    current_user = Guardian.Plug.current_resource(conn)

    json(conn, %{
      data:
        Enum.map(
          PasswordResetSupport.list_contacts_for_owner(:master_admin, current_user.id),
          &contact_json/1
        )
    })
  end

  def super_admin_create(conn, params) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, contact} <-
           PasswordResetSupport.create_contact_for_owner(:super_admin, current_user, params) do
      maybe_audit(
        current_user,
        "super_admin_create_reset_support_contact",
        contact,
        audit_meta(conn)
      )

      conn |> put_status(:created) |> json(%{data: contact_json(contact)})
    end
  end

  def master_admin_create(conn, params) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, contact} <-
           PasswordResetSupport.create_contact_for_owner(:master_admin, current_user, params) do
      maybe_audit(
        current_user,
        "master_admin_create_reset_support_contact",
        contact,
        audit_meta(conn)
      )

      conn |> put_status(:created) |> json(%{data: contact_json(contact)})
    end
  end

  def super_admin_update(conn, %{"id" => id} = params) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, contact} <-
           PasswordResetSupport.update_contact_for_owner(
             :super_admin,
             current_user,
             id,
             Map.delete(params, "id")
           ) do
      maybe_audit(
        current_user,
        "super_admin_update_reset_support_contact",
        contact,
        audit_meta(conn)
      )

      json(conn, %{data: contact_json(contact)})
    end
  end

  def master_admin_update(conn, %{"id" => id} = params) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, contact} <-
           PasswordResetSupport.update_contact_for_owner(
             :master_admin,
             current_user,
             id,
             Map.delete(params, "id")
           ) do
      maybe_audit(
        current_user,
        "master_admin_update_reset_support_contact",
        contact,
        audit_meta(conn)
      )

      json(conn, %{data: contact_json(contact)})
    end
  end

  def super_admin_delete(conn, %{"id" => id}) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, contact} <-
           PasswordResetSupport.delete_contact_for_owner(:super_admin, current_user, id) do
      maybe_audit(
        current_user,
        "super_admin_delete_reset_support_contact",
        contact,
        audit_meta(conn)
      )

      json(conn, %{data: %{deleted: true}})
    end
  end

  def master_admin_delete(conn, %{"id" => id}) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, contact} <-
           PasswordResetSupport.delete_contact_for_owner(:master_admin, current_user, id) do
      maybe_audit(
        current_user,
        "master_admin_delete_reset_support_contact",
        contact,
        audit_meta(conn)
      )

      json(conn, %{data: %{deleted: true}})
    end
  end

  defp contact_json(contact) do
    %{
      id: contact.id,
      owner_type: contact.owner_type,
      owner_id: contact.owner_id,
      channel: contact.channel,
      label: contact.label,
      value: contact.value,
      is_active: contact.is_active,
      inserted_at: contact.inserted_at,
      updated_at: contact.updated_at
    }
  end

  defp maybe_audit(current_user, action, contact, meta) do
    Admin.log_action(%{
      actor_id: current_user.id,
      action: action,
      target_type: "PasswordResetContact",
      target_id: contact.id,
      payload: %{
        owner_type: contact.owner_type,
        owner_id: contact.owner_id,
        channel: contact.channel,
        label: contact.label,
        value: contact.value,
        is_active: contact.is_active,
        ip_address: meta[:ip_address],
        user_agent: meta[:user_agent]
      }
    })
  end

  defp audit_meta(conn) do
    %{
      ip_address: conn.remote_ip |> :inet.ntoa() |> to_string(),
      user_agent: List.first(get_req_header(conn, "user-agent"))
    }
  rescue
    _ -> %{}
  end

  defp present?(value) when is_binary(value), do: String.trim(value) != ""
  defp present?(_), do: false
end
