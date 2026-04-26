defmodule Back.MultiSource.Supervisor do
  use Supervisor

  def start_link(opts \\ []) do
    Supervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    redis_url = Application.get_env(:back, :multi_source_redis_url, "redis://127.0.0.1:6379")

    children = [
      %{
        id: Back.MultiSource.RedisPubSub,
        start: {Redix.PubSub, :start_link, [redis_url, [name: Back.MultiSource.RedisPubSub]]}
      },
      {Back.MultiSource.RedisConsumer,
       [pubsub_name: Back.MultiSource.RedisPubSub, channel: "odds_raw_stream"]},
      {Back.MultiSource.ScraperActionResultConsumer,
       [pubsub_name: Back.MultiSource.RedisPubSub, channel: "control:scraper-action-results"]},
      Back.MultiSource.ScraperConfigReplayer,
      Back.MultiSource.FailoverMonitor
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end
end
