alias Back.Repo
alias Back.Accounts.User

super_admin_email = System.get_env("SUPER_ADMIN_EMAIL", "admin@sixerbat.com")
super_admin_password = System.get_env("SUPER_ADMIN_PASSWORD", "Admin@123456")
master_admin_email = System.get_env("MASTER_ADMIN_EMAIL", "master@sixerbat.com")
master_admin_password = System.get_env("MASTER_ADMIN_PASSWORD", "Master@123456")
player_email = System.get_env("PLAYER_EMAIL", "player@sixerbat.com")
player_password = System.get_env("PLAYER_PASSWORD", "Player@123456")

super_admin =
  case Repo.get_by(User, email: super_admin_email) do
    nil ->
      %User{}
      |> User.registration_changeset(%{
        "email" => super_admin_email,
        "username" => "super_admin_dev",
        "password" => super_admin_password,
        "role" => "super_admin",
        "balance" => "0"
      })
      |> Repo.insert!()
      |> then(fn user ->
        IO.puts("✅ Super Admin created: #{super_admin_email}")
        user
      end)

    existing ->
      IO.puts("ℹ️  Super Admin already exists: #{super_admin_email}")
      existing
  end

master_admin =
  case Repo.get_by(User, email: master_admin_email) do
    nil ->
      %User{}
      |> User.master_admin_changeset(%{
        "email" => master_admin_email,
        "username" => "master_admin_dev",
        "password" => master_admin_password,
        "balance" => "50000",
        "master_admin_type" => "volume_based",
        "volume_margin" => "5",
        "created_by_id" => super_admin.id
      })
      |> Repo.insert!()
      |> then(fn user ->
        IO.puts("✅ Master Admin created: #{master_admin_email}")
        user
      end)

    existing ->
      IO.puts("ℹ️  Master Admin already exists: #{master_admin_email}")
      existing
  end

case Repo.get_by(User, email: player_email) do
  nil ->
    %User{}
    |> User.registration_changeset(%{
      "email" => player_email,
      "username" => "player_dev",
      "password" => player_password,
      "role" => "player",
      "balance" => "10000",
      "created_by_id" => master_admin.id
    })
    |> Repo.insert!()

    IO.puts("✅ Player created: #{player_email}")

  _existing ->
    IO.puts("ℹ️  Player already exists: #{player_email}")
end
