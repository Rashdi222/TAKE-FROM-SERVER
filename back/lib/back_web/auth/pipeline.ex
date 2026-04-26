defmodule BackWeb.Auth.Pipeline do
  @moduledoc "Guardian pipeline: verifies Bearer token and loads the resource."

  use Guardian.Plug.Pipeline,
    otp_app: :back,
    module: Back.Auth.Guardian,
    error_handler: BackWeb.Auth.ErrorHandler

  plug Guardian.Plug.VerifyHeader, scheme: "Bearer"
  plug Guardian.Plug.EnsureAuthenticated
  plug Guardian.Plug.LoadResource, allow_blank: false
end
