defmodule Back.Accounts.PasswordResetSupport do
  @moduledoc false

  import Ecto.Query

  alias Back.Accounts.PasswordResetContact
  alias Back.Accounts.PasswordResetSupportPubSub
  alias Back.Accounts.PhoneLookup
  alias Back.Accounts.User
  alias Back.Repo

  def list_contacts_for_owner(owner_type, owner_id) do
    PasswordResetContact
    |> where([c], c.owner_type == ^owner_type and c.owner_id == ^owner_id)
    |> order_by([c], desc: c.is_active, asc: c.channel, desc: c.updated_at)
    |> Repo.all()
  end

  def create_contact_for_owner(owner_type, %User{id: owner_id, role: role}, attrs)
      when owner_type in [:super_admin, :master_admin] do
    with :ok <- validate_owner_role(owner_type, role) do
      %PasswordResetContact{}
      |> PasswordResetContact.changeset(
        attrs
        |> Map.new()
        |> Map.put("owner_type", owner_type)
        |> Map.put("owner_id", owner_id)
      )
      |> Repo.insert()
      |> notify(owner_type, owner_id)
    end
  end

  def update_contact_for_owner(owner_type, %User{id: owner_id}, contact_id, attrs) do
    with %PasswordResetContact{} = contact <- get_owner_contact(owner_type, owner_id, contact_id),
         {:ok, updated} <- contact |> PasswordResetContact.changeset(attrs) |> Repo.update() do
      PasswordResetSupportPubSub.broadcast_owner_contacts_updated(owner_type, owner_id)
      {:ok, updated}
    else
      nil -> {:error, :not_found}
      {:error, reason} -> {:error, reason}
    end
  end

  def delete_contact_for_owner(owner_type, %User{id: owner_id}, contact_id) do
    with %PasswordResetContact{} = contact <- get_owner_contact(owner_type, owner_id, contact_id),
         {:ok, deleted} <- Repo.delete(contact) do
      PasswordResetSupportPubSub.broadcast_owner_contacts_updated(owner_type, owner_id)
      {:ok, deleted}
    else
      nil -> {:error, :not_found}
      {:error, reason} -> {:error, reason}
    end
  end

  def resolve_public_support_by_phone(phone_number) when is_binary(phone_number) do
    if PhoneLookup.valid_lookup_phone?(phone_number) do
      case PhoneLookup.find_user_by_phone(phone_number) do
        nil ->
          {:ok,
           unavailable_result(
             "We could not find an account for that phone number. Double-check the number or try your email instead."
           )}

        %User{} = user ->
          {:ok, build_support_result(user)}
      end
    else
      {:error, :invalid_phone_number}
    end
  end

  def resolve_public_support_by_email(email) when is_binary(email) do
    normalized = normalize_email(email)

    if valid_lookup_email?(normalized) do
      case find_user_by_email(normalized) do
        nil ->
          {:ok,
           unavailable_result(
             "We could not find an account for that email address. Double-check it or try your phone number instead."
           )}

        %User{} = user ->
          {:ok, build_support_result(user)}
      end
    else
      {:error, :invalid_email}
    end
  end

  def resolve_support_for_user(%User{} = user) do
    {:ok, build_support_result(user)}
  end

  defp build_support_result(%User{} = user) do
    case resolve_owner_and_contacts(user) do
      %{contacts: [_ | _] = contacts, owner: owner, owner_type: owner_type} ->
        %{
          available: true,
          owner_type: Atom.to_string(owner_type),
          owner_name: owner_name(owner),
          requester: requester_json(user),
          contacts: Enum.map(contacts, &contact_json/1),
          message: "Use one of these support contacts to request a password reset link."
        }

      _ ->
        unavailable_result(
          "No reset support contact is available for this account right now. Please try again shortly or contact platform support."
        )
    end
  end

  defp resolve_owner_and_contacts(%User{created_by_id: created_by_id})
       when not is_nil(created_by_id) do
    case Repo.get(User, created_by_id) do
      %User{role: :master_admin, is_active: true} = master_admin ->
        contacts = active_contacts(:master_admin, master_admin.id)

        if contacts == [] do
          resolve_global_support()
        else
          %{owner_type: :master_admin, owner: master_admin, contacts: contacts}
        end

      _ ->
        resolve_global_support()
    end
  end

  defp resolve_owner_and_contacts(_user), do: resolve_global_support()

  defp resolve_global_support do
    case active_super_admin_owner() do
      %User{} = owner ->
        %{
          owner_type: :super_admin,
          owner: owner,
          contacts: active_contacts(:super_admin, owner.id)
        }

      nil ->
        %{owner_type: :super_admin, owner: nil, contacts: []}
    end
  end

  defp active_super_admin_owner do
    from(u in User,
      where: u.role == :super_admin and u.is_active == true,
      order_by: [desc: u.updated_at, desc: u.inserted_at],
      limit: 1
    )
    |> Repo.one()
  end

  defp active_contacts(owner_type, owner_id) do
    PasswordResetContact
    |> where([c], c.owner_type == ^owner_type and c.owner_id == ^owner_id and c.is_active == true)
    |> order_by([c], asc: c.channel, desc: c.updated_at)
    |> Repo.all()
  end

  defp get_owner_contact(owner_type, owner_id, contact_id) do
    Repo.get_by(PasswordResetContact, id: contact_id, owner_type: owner_type, owner_id: owner_id)
  end

  defp validate_owner_role(:super_admin, :super_admin), do: :ok
  defp validate_owner_role(:master_admin, :master_admin), do: :ok
  defp validate_owner_role(_, _), do: {:error, :forbidden}

  defp notify({:ok, %PasswordResetContact{} = contact}, owner_type, owner_id) do
    PasswordResetSupportPubSub.broadcast_owner_contacts_updated(owner_type, owner_id)
    {:ok, contact}
  end

  defp notify({:error, reason}, _owner_type, _owner_id), do: {:error, reason}

  defp unavailable_result(message) do
    %{
      available: false,
      requester: nil,
      contacts: [],
      message: message
    }
  end

  defp contact_json(contact) do
    %{
      id: contact.id,
      channel: contact.channel,
      label: contact.label,
      value: contact.value,
      is_active: contact.is_active
    }
  end

  defp owner_name(%User{username: username}) when is_binary(username) and username != "",
    do: username

  defp owner_name(%User{email: email}), do: email

  defp requester_json(%User{} = user) do
    %{
      username: present_or_nil(user.username),
      email: present_or_nil(user.email),
      phone_number: present_or_nil(user.phone_number),
      account_currency: present_or_nil(user.account_currency),
      balance: decimal_or_nil(user.balance)
    }
  end

  defp find_user_by_email(email) when is_binary(email) do
    from(u in User,
      where: u.role in [:player, :customer],
      where: fragment("lower(coalesce(?, ''))", u.email) == ^email,
      order_by: [desc: u.inserted_at],
      limit: 1
    )
    |> Repo.one()
  end

  defp normalize_email(value) when is_binary(value),
    do: value |> String.trim() |> String.downcase()

  defp normalize_email(_), do: ""

  defp valid_lookup_email?(email) when is_binary(email) do
    email != "" and String.contains?(email, "@") and String.length(email) <= 160
  end

  defp present_or_nil(value) when is_binary(value) do
    trimmed = String.trim(value)
    if trimmed == "", do: nil, else: trimmed
  end

  defp present_or_nil(_), do: nil

  defp decimal_or_nil(%Decimal{} = value), do: Decimal.to_string(value, :normal)
  defp decimal_or_nil(_), do: nil
end
