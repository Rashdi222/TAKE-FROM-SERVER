defmodule Back.Workers.HorseRacingFetchWorker do
  use Oban.Worker, queue: :data_feeds, max_attempts: 5

  require Logger

  alias Back.SportsData
  alias Back.SportsProviders.Goalserve

  @source "oban:horse_racing_fetch"
  @provider_atom :goalserve
  @default_regions ["uk", "usa", "france"]
  @default_min_delay_ms 500

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    regions = parse_regions(args)
    per_call_delay_ms = @default_min_delay_ms

    {events, errors} =
      Enum.reduce(regions, {[], []}, fn region, {all_events, all_errors} ->
        result = Goalserve.fetch_fixtures(%{"region" => region})

        case result do
          {:ok, rows} ->
            Process.sleep(per_call_delay_ms)
            {all_events ++ rows, all_errors}

          {:error, reason} ->
            Process.sleep(per_call_delay_ms)
            {all_events, [%{region: region, reason: inspect(reason)} | all_errors]}
        end
      end)

    with {:ok, result} <- SportsData.upsert_events(events) do
      status =
        cond do
          errors == [] and result.failed_count == 0 -> :success
          events == [] -> :failure
          true -> :partial
        end

      _ =
        SportsData.log_sync(%{
          provider: @provider_atom,
          source: @source,
          status: status,
          fetched_count: length(events),
          upserted_count: result.upserted_count,
          failed_count: result.failed_count,
          error: if(errors == [], do: nil, else: inspect(Enum.reverse(errors))),
          metadata: %{"regions" => regions, "errors" => Enum.reverse(errors)}
        })

      if status == :failure do
        {:error, :all_regions_failed}
      else
        :ok
      end
    else
      {:error, reason} = error ->
        _ =
          SportsData.log_sync(%{
            provider: @provider_atom,
            source: @source,
            status: :failure,
            error: inspect(reason),
            metadata: %{"regions" => regions}
          })

        Logger.error("HorseRacingFetchWorker failed: #{inspect(reason)}")
        error
    end
  end

  defp parse_regions(args) do
    case args["regions"] do
      regions when is_list(regions) and regions != [] -> Enum.map(regions, &to_string/1)
      _ -> @default_regions
    end
  end
end
