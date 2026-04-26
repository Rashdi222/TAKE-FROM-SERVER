import { TennisMatchPageClient } from "@/components/tennis/public/TennisMatchPageClient";

export default async function PublicTennisMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TennisMatchPageClient eventKey={id} initialMatch={null} />;
}
