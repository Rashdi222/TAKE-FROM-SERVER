defmodule Back.Security.Encryption do
  @moduledoc false

  @prefix "enc:v1:"

  def encrypt(nil), do: nil
  def encrypt(""), do: ""

  def encrypt(value) when is_binary(value) do
    if String.starts_with?(value, @prefix) do
      value
    else
      key = encryption_key()
      iv = :crypto.strong_rand_bytes(12)
      {ciphertext, tag} = :crypto.crypto_one_time_aead(:aes_256_gcm, key, iv, value, "", true)

      @prefix <>
        Base.url_encode64(iv, padding: false) <>
        ":" <>
        Base.url_encode64(tag, padding: false) <>
        ":" <>
        Base.url_encode64(ciphertext, padding: false)
    end
  end

  def decrypt(nil), do: nil
  def decrypt(""), do: ""

  def decrypt(value) when is_binary(value) do
    if String.starts_with?(value, @prefix) do
      decode_and_decrypt(value)
    else
      value
    end
  end

  defp decode_and_decrypt(@prefix <> payload) do
    with [iv_b64, tag_b64, ct_b64] <- String.split(payload, ":", parts: 3),
         {:ok, iv} <- Base.url_decode64(iv_b64, padding: false),
         {:ok, tag} <- Base.url_decode64(tag_b64, padding: false),
         {:ok, ciphertext} <- Base.url_decode64(ct_b64, padding: false) do
      case :crypto.crypto_one_time_aead(
             :aes_256_gcm,
             encryption_key(),
             iv,
             ciphertext,
             "",
             tag,
             false
           ) do
        plaintext when is_binary(plaintext) -> plaintext
        _ -> nil
      end
    else
      _ -> nil
    end
  end

  defp encryption_key do
    configured = System.get_env("FIELD_ENCRYPTION_KEY")

    key_material =
      cond do
        is_binary(configured) and byte_size(String.trim(configured)) > 0 ->
          configured

        true ->
          Application.get_env(:back, Back.Auth.Guardian, [])
          |> Keyword.get(:secret_key, "dev_encryption_fallback_key")
      end

    :crypto.hash(:sha256, key_material)
  end
end
