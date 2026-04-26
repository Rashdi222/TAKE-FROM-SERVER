defmodule Back.AI.Automation.RunTracker do
  @moduledoc false

  import Ecto.Query

  alias Back.AI.Automation.OddsAutomationRun
  alias Back.Repo

  def latest_runs_by_match_ids(match_ids) when is_list(match_ids) do
    ids = Enum.uniq(Enum.reject(match_ids, &is_nil/1))

    if ids == [] do
      %{}
    else
      runs =
        from(r in OddsAutomationRun,
          where: r.match_id in ^ids,
          order_by: [desc: r.inserted_at]
        )
        |> Repo.all()

      Enum.reduce(runs, %{}, fn run, acc ->
        match_runs = Map.get(acc, run.match_id, %{})

        if Map.has_key?(match_runs, run.phase) do
          acc
        else
          Map.put(acc, run.match_id, Map.put(match_runs, run.phase, run))
        end
      end)
    end
  end
end
