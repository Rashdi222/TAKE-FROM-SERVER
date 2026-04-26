defmodule Back.Security.EncryptionTest do
  use ExUnit.Case, async: true

  alias Back.Security.Encryption

  test "encrypt and decrypt roundtrip" do
    plaintext = "top-secret"
    encrypted = Encryption.encrypt(plaintext)

    assert encrypted != plaintext
    assert Encryption.decrypt(encrypted) == plaintext
  end

  test "decrypt keeps plain string untouched" do
    assert Encryption.decrypt("already-plain") == "already-plain"
  end
end
