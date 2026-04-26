import { TennisLobbyPageClient } from "@/components/tennis/public/TennisLobbyPageClient";
import { publicApi, type TennisFixture, type TennisMatchState } from "@/lib/api";

export default async function PublicTennisPage() {
  const today = new Date();
  const dateStart = today.toISOString().slice(0, 10);
  const dateStop = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [fixturesResult, liveResult] = await Promise.allSettled([
    publicApi.tennis.fixtures({ date_start: dateStart, date_stop: dateStop }),
    publicApi.tennis.live(),
  ]);

  const initialFixtures =
    fixturesResult.status === "fulfilled"
      ? ((fixturesResult.value.data ?? []) as TennisFixture[])
      : [];

  const initialLive =
    liveResult.status === "fulfilled" ? ((liveResult.value.data ?? []) as TennisMatchState[]) : [];

  return <TennisLobbyPageClient initialFixtures={initialFixtures} initialLive={initialLive} />;
}
