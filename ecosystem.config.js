module.exports = {
  apps: [
    {
      name: "sixit-phoenix",
      cwd: "/root/sixerbat/sixit/back",
      script: "/bin/bash",
      args: "-lc 'export PORT=4001 PHX_SERVER=true MIX_ENV=dev PATH=/root/.asdf/installs/erlang/26.2.5/bin:/root/.asdf/installs/elixir/1.17.3-otp-26/bin:/root/.asdf/shims:/root/.asdf/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; exec /root/.asdf/installs/elixir/1.17.3-otp-26/bin/mix phx.server'",
      env: {
        PORT: "4001",
        PHX_SERVER: "true",
        MIX_ENV: "dev",
        PATH: "/root/.asdf/installs/erlang/26.2.5/bin:/root/.asdf/installs/elixir/1.17.3-otp-26/bin:/root/.asdf/shims:/root/.asdf/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      },
      interpreter: "none",
    },
    {
      name: "sixit-next",
      cwd: "/root/sixerbat/sixit/next",
      script: "node_modules/.bin/next",
      args: "start -p 3003",
      interpreter: "none",
    },
    {
      name: "sixit-ai",
      cwd: "/root/sixerbat/sixit/ai_engine",
      script: "python3",
      args: "-m uvicorn main:app --host 127.0.0.1 --port 8001",
      interpreter: "none",
    },
  ],
};
