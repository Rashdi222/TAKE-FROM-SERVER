import { notFound, redirect } from "next/navigation";
import { fetchPublicMatch } from "@/lib/seo/public-data";
import { getMatchPath } from "@/lib/seo/match";

type MatchRedirectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function MatchRedirectPage({ params }: MatchRedirectPageProps) {
  const { id } = await params;
  const match = await fetchPublicMatch(id);

  if (match) {
    redirect(getMatchPath(match));
  }

  notFound();
}

