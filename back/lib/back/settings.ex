defmodule Back.Settings do
  alias Back.Repo
  alias Back.Security.Encryption
  alias Back.Settings.Setting

  @encrypted_keys MapSet.new(["openrouter_api_key"])

  def get(key, default \\ nil) when is_binary(key) do
    case Repo.get_by(Setting, key: key) do
      nil -> default
      %Setting{value: %{"value" => value}} -> maybe_decrypt(key, value)
      %Setting{value: value} -> value
    end
  end

  def put(key, value) when is_binary(key) do
    attrs = %{"key" => key, "value" => wrap_value(key, value)}

    case Repo.get_by(Setting, key: key) do
      nil ->
        %Setting{} |> Setting.changeset(attrs) |> Repo.insert()

      setting ->
        setting |> Setting.changeset(%{"value" => wrap_value(key, value)}) |> Repo.update()
    end
  end

  def get_setting_record(key) when is_binary(key), do: Repo.get_by(Setting, key: key)

  defp wrap_value(_key, value) when is_map(value), do: value
  defp wrap_value(key, value), do: %{"value" => maybe_encrypt(key, value)}

  defp maybe_encrypt(key, value) when is_binary(value) do
    if MapSet.member?(@encrypted_keys, key), do: Encryption.encrypt(value), else: value
  end

  defp maybe_encrypt(_key, value), do: value

  defp maybe_decrypt(key, value) when is_binary(value) do
    if MapSet.member?(@encrypted_keys, key), do: Encryption.decrypt(value), else: value
  end

  defp maybe_decrypt(_key, value), do: value
end
