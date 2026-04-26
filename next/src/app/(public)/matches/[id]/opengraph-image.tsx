import { ImageResponse } from "next/og";
import { fetchPublicMatch } from "@/lib/seo/public-data";
import { getMatchDisplayName } from "@/lib/seo/match";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

type MatchOgImageProps = {
  params: Promise<{ id: string }>;
};

export default async function MatchOpenGraphImage({
  params,
}: MatchOgImageProps) {
  const { id } = await params;
  const match = await fetchPublicMatch(id);
  const title = match ? getMatchDisplayName(match) : "Match";
  const sport = match?.sport ? String(match.sport).replace(/_/g, " ") : "sports";
  const status = match?.status ? String(match.status).toUpperCase() : "SCHEDULED";
  const startTime = match?.start_time
    ? new Date(match.start_time).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "TBA";

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at top right, rgba(99,32,232,0.45), transparent 32%), linear-gradient(135deg, #0d0b15 0%, #17132f 50%, #261b4a 100%)",
          color: "#f7f4ff",
          padding: "64px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 24,
            color: "#b7abd8",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
          }}
        >
          <div>{sport}</div>
          <div>{status}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div
            style={{
              fontSize: 78,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.05em",
              maxWidth: 980,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 34,
              color: "#d4ceea",
            }}
          >
            Published odds and match coverage on Sixerbat
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 28,
            color: "#c3b9ea",
          }}
        >
          <div>{startTime}</div>
          <div>Sixerbat</div>
        </div>
      </div>
    ),
    size,
  );
}

