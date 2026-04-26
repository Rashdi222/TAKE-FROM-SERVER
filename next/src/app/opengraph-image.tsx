import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/seo/site";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
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
            "radial-gradient(circle at top right, rgba(58,139,255,0.35), transparent 30%), linear-gradient(135deg, #0d0b15 0%, #16132a 50%, #241a44 100%)",
          color: "#f7f4ff",
          padding: "64px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: 28,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#a79ad8",
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: "#3a8bff",
              boxShadow: "0 0 18px rgba(58,139,255,0.8)",
            }}
          />
          Operator Grade Sports Betting
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div
            style={{
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-0.05em",
            }}
          >
            {SITE_NAME}
          </div>
          <div
            style={{
              fontSize: 36,
              lineHeight: 1.25,
              maxWidth: 920,
              color: "#d4ceea",
            }}
          >
            Live matches, published platform odds, AI-assisted operations, and public sportsbook coverage.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "16px",
            fontSize: 24,
            color: "#c3b9ea",
          }}
        >
          <div>Cricket</div>
          <div>Football</div>
          <div>Tennis</div>
          <div>Horse Racing</div>
          <div>Dog Racing</div>
        </div>
      </div>
    ),
    size,
  );
}

