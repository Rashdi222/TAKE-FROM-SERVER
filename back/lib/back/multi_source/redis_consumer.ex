defmodule Back.MultiSource.RedisConsumer do
  use GenServer

  require Logger

  @channel "odds_raw_stream"
  @subscribe_retry_ms 2_000

  def status do
    GenServer.call(__MODULE__, :status)
  catch
    :exit, _ -> %{running: false, subscribed: false, channel: @channel, last_message_at: nil}
  end

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(opts) do
    state = %{
      pubsub_name: Keyword.get(opts, :pubsub_name, Back.MultiSource.RedisPubSub),
      channel: Keyword.get(opts, :channel, @channel),
      subscribed?: false,
      last_message_at: nil
    }

    send(self(), :subscribe)
    {:ok, state}
  end

  @impl true
  def handle_call(:status, _from, state) do
    {:reply,
     %{
       running: true,
       subscribed: state.subscribed?,
       channel: state.channel,
       last_message_at: state.last_message_at
     }, state}
  end

  @impl true
  def handle_info(:subscribe, state) do
    case Redix.PubSub.subscribe(state.pubsub_name, state.channel, self()) do
      {:ok, _ref} ->
        Logger.info("multi-source arbiter subscribed to #{state.channel}")
        {:noreply, %{state | subscribed?: true}}

      {:error, reason} ->
        Logger.warning("multi-source arbiter subscribe failed: #{inspect(reason)}")
        Process.send_after(self(), :subscribe, @subscribe_retry_ms)
        {:noreply, %{state | subscribed?: false}}
    end
  end

  def handle_info({:redix_pubsub, _pubsub, _ref, :subscribed, _meta}, state) do
    {:noreply, %{state | subscribed?: true}}
  end

  def handle_info(
        {:redix_pubsub, _pubsub, _ref, :message, %{channel: @channel, payload: payload}},
        state
      ) do
    _ = Back.MultiSource.Arbiter.ingest_raw_payload(payload)
    {:noreply, %{state | last_message_at: DateTime.utc_now()}}
  end

  def handle_info({:redix_pubsub, _pubsub, _ref, type, reason}, state)
      when type in [:disconnected, :connection_error] do
    Logger.warning("multi-source arbiter Redis consumer degraded: #{inspect(reason)}")
    {:noreply, %{state | subscribed?: false}}
  end

  def handle_info(_message, state), do: {:noreply, state}
end
