defmodule BackWeb.PageController do
  use BackWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
