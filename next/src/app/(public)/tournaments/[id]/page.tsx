import { notFound, redirect } from "next/navigation";
import { fetchPublicTournament } from "@/lib/seo/public-data";

type TournamentRedirectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TournamentRedirectPage({
  params,
}: TournamentRedirectPageProps) {
  const { id } = await params;
  const tournament = await fetchPublicTournament(id);

  if (!tournament) {
    notFound();
  }

  redirect(`/tournaments/${tournament.id}/${tournament.slug}`);
}
