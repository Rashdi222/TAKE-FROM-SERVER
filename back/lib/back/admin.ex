defmodule Back.Admin do
  import Ecto.Query

  alias Back.Admin.AuditLog
  alias Back.Repo

  def log_action(attrs) when is_map(attrs) do
    attrs = normalize_audit_attrs(attrs)

    %AuditLog{}
    |> AuditLog.changeset(attrs)
    |> Repo.insert()
  end

  def list_audit_logs(filters \\ %{}) do
    page = to_int(filters[:page] || filters["page"], 1)
    page_size = to_int(filters[:page_size] || filters["page_size"], 50)
    offset = max((page - 1) * page_size, 0)

    AuditLog
    |> apply_audit_filters(filters)
    |> order_by([a], desc: a.inserted_at)
    |> limit(^page_size)
    |> offset(^offset)
    |> Repo.all()
  end

  def get_user_actions(user_id, opts \\ %{}) when is_binary(user_id) do
    opts
    |> Map.new()
    |> Map.put("actor_id", user_id)
    |> list_audit_logs()
  end

  defp apply_audit_filters(query, filters) do
    Enum.reduce(filters, query, fn
      {:actor_id, actor_id}, q -> where(q, [a], a.actor_id == ^actor_id)
      {"actor_id", actor_id}, q -> where(q, [a], a.actor_id == ^actor_id)
      {:action, action}, q -> where(q, [a], a.action == ^action)
      {"action", action}, q -> where(q, [a], a.action == ^action)
      {:target_type, type}, q -> where(q, [a], a.target_type == ^type)
      {"target_type", type}, q -> where(q, [a], a.target_type == ^type)
      {:from, %DateTime{} = from_dt}, q -> where(q, [a], a.inserted_at >= ^from_dt)
      {"from", %DateTime{} = from_dt}, q -> where(q, [a], a.inserted_at >= ^from_dt)
      {:to, %DateTime{} = to_dt}, q -> where(q, [a], a.inserted_at <= ^to_dt)
      {"to", %DateTime{} = to_dt}, q -> where(q, [a], a.inserted_at <= ^to_dt)
      _, q -> q
    end)
  end

  defp to_int(nil, default), do: default

  defp to_int(value, _default) when is_integer(value) and value > 0, do: value

  defp to_int(value, default) when is_binary(value) do
    case Integer.parse(value) do
      {int, ""} when int > 0 -> int
      _ -> default
    end
  end

  defp to_int(_, default), do: default

  defp normalize_audit_attrs(attrs) do
    attrs
    |> Enum.map(fn
      {:payload, payload} -> {:payload, sanitize_value(payload)}
      {"payload", payload} -> {"payload", sanitize_value(payload)}
      entry -> entry
    end)
    |> Map.new()
    |> normalize_target_id()
  end

  defp normalize_target_id(attrs) when is_map(attrs) do
    raw_target_id =
      Map.get(attrs, :target_id) ||
        Map.get(attrs, "target_id")

    case normalize_binary_id(raw_target_id) do
      {:ok, nil} ->
        attrs
        |> Map.put(:target_id, nil)
        |> Map.delete("target_id")

      {:ok, uuid} ->
        attrs
        |> Map.put(:target_id, uuid)
        |> Map.delete("target_id")

      {:external, external_id} ->
        attrs
        |> Map.put(:target_id, nil)
        |> Map.delete("target_id")
        |> put_external_target_ref(external_id)
    end
  end

  defp normalize_binary_id(nil), do: {:ok, nil}

  defp normalize_binary_id(value) when is_binary(value) do
    case Ecto.UUID.cast(value) do
      {:ok, uuid} -> {:ok, uuid}
      :error -> {:external, value}
    end
  end

  defp normalize_binary_id(value), do: {:external, inspect(value)}

  defp put_external_target_ref(attrs, external_id) do
    payload =
      attrs
      |> Map.get(:payload, %{})
      |> ensure_map()
      |> Map.put_new("target_ref", external_id)

    Map.put(attrs, :payload, payload)
  end

  defp ensure_map(value) when is_map(value), do: value
  defp ensure_map(_), do: %{}

  defp sanitize_value(%Decimal{} = value), do: Decimal.to_string(value, :normal)
  defp sanitize_value(%DateTime{} = value), do: value
  defp sanitize_value(%NaiveDateTime{} = value), do: value
  defp sanitize_value(%Date{} = value), do: value
  defp sanitize_value(%Time{} = value), do: value

  defp sanitize_value(value) when is_map(value),
    do: Map.new(value, fn {k, v} -> {k, sanitize_value(v)} end)

  defp sanitize_value(value) when is_list(value), do: Enum.map(value, &sanitize_value/1)
  defp sanitize_value(value), do: value
end
