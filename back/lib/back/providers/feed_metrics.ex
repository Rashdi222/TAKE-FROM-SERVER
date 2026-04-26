defmodule Back.Providers.FeedMetrics do
  import Ecto.Query

  alias Back.Repo
  alias Back.Betting.Match
  alias Back.Betting.Odds
  alias Back.Providers.ApiSportsLiveOddsIndex
  alias Back.Providers.CompetitionFeed
  alias Back.Providers.Provider
  alias Back.Providers.SportmonksDetailRefresher
  alias Back.Providers.ProviderSyncLog
  alias Back.Providers.SportmonksLiveIndex

  def summarize_feed(%CompetitionFeed{} = feed) do
    %{
      feed_id: feed.id,
      imported_fixture_count: count_imported_matches(feed),
      upcoming_match_count: count_matches_by_status(feed, :upcoming),
      live_match_count: count_matches_by_status(feed, :live),
      closed_match_count: count_matches_by_status(feed, :closed),
      settled_match_count: count_matches_by_status(feed, :settled),
      cancelled_match_count: count_matches_by_status(feed, :cancelled),
      last_fixture_import: latest_sync(feed, "fixtures"),
      last_live_sync: latest_sync(feed, "live"),
      live_index: sportmonks_live_index_metrics(feed),
      detail_refresh: sportmonks_detail_refresh_metrics(feed),
      live_odds_index: api_sports_live_odds_index_metrics(feed),
      failed_sync_count: failed_sync_count(feed),
      provider_odds_imported_count: count_provider_imported_odds(feed),
      last_provider_odds_import_at: last_provider_odds_import_at(feed),
      last_provider_odds_fetch: latest_sync(feed, "provider_odds_fetch"),
      last_provider_odds_import: latest_sync(feed, "provider_odds_import"),
      failed_provider_odds_operation_count: failed_provider_odds_operation_count(feed)
    }
  end

  def summarize_feeds(feeds) when is_list(feeds) do
    Enum.into(feeds, %{}, fn
      %CompetitionFeed{id: id} = feed -> {id, summarize_feed(feed)}
    end)
  end

  defp count_imported_matches(%CompetitionFeed{} = feed) do
    Repo.aggregate(feed_match_query(feed), :count, :id)
  end

  defp count_matches_by_status(%CompetitionFeed{} = feed, status) do
    feed
    |> feed_match_query()
    |> where([m], m.status == ^status)
    |> Repo.aggregate(:count, :id)
  end

  defp latest_sync(%CompetitionFeed{} = feed, kind) when is_binary(kind) and kind != "" do
    Repo.one(
      from l in ProviderSyncLog,
        where: l.provider_id == ^feed.provider_id,
        where: fragment("?->>'competition_feed_id' = ?", l.metadata, ^feed.id),
        where: fragment("?->>'kind' = ?", l.metadata, ^kind),
        order_by: [desc: l.inserted_at],
        limit: 1,
        select: %{
          id: l.id,
          status: l.status,
          sync_type: l.sync_type,
          duration_ms: l.duration_ms,
          error: l.error,
          inserted_at: l.inserted_at,
          metadata: l.metadata
        }
    )
  end

  defp failed_sync_count(%CompetitionFeed{} = feed) do
    Repo.aggregate(
      from(l in ProviderSyncLog,
        where: l.provider_id == ^feed.provider_id,
        where: l.status == :failure,
        where: fragment("?->>'competition_feed_id' = ?", l.metadata, ^feed.id)
      ),
      :count,
      :id
    )
  end

  defp failed_provider_odds_operation_count(%CompetitionFeed{} = feed) do
    Repo.aggregate(
      from(l in ProviderSyncLog,
        where: l.provider_id == ^feed.provider_id,
        where: l.status == :failure,
        where: fragment("?->>'competition_feed_id' = ?", l.metadata, ^feed.id),
        where:
          fragment("?->>'kind' IN ('provider_odds_fetch', 'provider_odds_import')", l.metadata)
      ),
      :count,
      :id
    )
  end

  defp count_provider_imported_odds(%CompetitionFeed{} = feed) do
    Repo.one(
      from o in Odds,
        join: m in Match,
        on: m.id == o.match_id,
        where: o.source_type == "provider_import",
        where: fragment("?->'_competition_feed'->>'id' = ?", m.raw_data, ^feed.id),
        select: count(o.id, :distinct)
    )
    |> Kernel.||(0)
  end

  defp last_provider_odds_import_at(%CompetitionFeed{} = feed) do
    Repo.one(
      from o in Odds,
        join: m in Match,
        on: m.id == o.match_id,
        where: o.source_type == "provider_import",
        where: fragment("?->'_competition_feed'->>'id' = ?", m.raw_data, ^feed.id),
        order_by: [desc: o.inserted_at],
        limit: 1,
        select: o.inserted_at
    )
  end

  defp feed_match_query(%CompetitionFeed{} = feed) do
    from m in Match,
      where: fragment("?->'_competition_feed'->>'id' = ?", m.raw_data, ^feed.id)
  end

  defp sportmonks_live_index_metrics(
         %CompetitionFeed{sport: "cricket", provider_id: provider_id} = feed
       )
       when is_binary(provider_id) do
    case Repo.get(Provider, provider_id) do
      %Provider{name: "sportmonks"} -> SportmonksLiveIndex.summary_for_feed(feed)
      _ -> nil
    end
  end

  defp sportmonks_live_index_metrics(_feed), do: nil

  defp sportmonks_detail_refresh_metrics(
         %CompetitionFeed{sport: "cricket", provider_id: provider_id} = feed
       )
       when is_binary(provider_id) do
    case Repo.get(Provider, provider_id) do
      %Provider{name: "sportmonks"} -> SportmonksDetailRefresher.summary_for_feed(feed)
      _ -> nil
    end
  end

  defp sportmonks_detail_refresh_metrics(_feed), do: nil

  defp api_sports_live_odds_index_metrics(
         %CompetitionFeed{sport: "football", provider_id: provider_id} = feed
       )
       when is_binary(provider_id) do
    case Repo.get(Provider, provider_id) do
      %Provider{name: "api_sports"} -> ApiSportsLiveOddsIndex.summary_for_feed(feed)
      _ -> nil
    end
  end

  defp api_sports_live_odds_index_metrics(_feed), do: nil
end
