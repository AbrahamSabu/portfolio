import { ImageResponse } from "next/og";
import { meta } from "@/lib/content";

/**
 * What a shared link looks like: the company, the line, and the mark, on the
 * page's own ground. Nothing on it that the page does not already say.
 */

export const alt = `${meta.company} — ${meta.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const VOID = "#101315";
const BONE = "#eef0f1";
const STEEL = "#a6abae";
const EMBER = "#ff682c";
const BRASS = "#c9a765";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: VOID,
          color: BONE,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="48" height="48" viewBox="-44 -44 88 88">
            <path transform="rotate(0)" d="M0 0 C -11 8, -13 28, 0 38 C 13 28, 11 8, 0 0 Z" fill={EMBER} />
            <path transform="rotate(72)" d="M0 0 C -11 8, -13 28, 0 38 C 13 28, 11 8, 0 0 Z" fill={EMBER} />
            <path transform="rotate(144)" d="M0 0 C -11 8, -13 28, 0 38 C 13 28, 11 8, 0 0 Z" fill={EMBER} />
            <path transform="rotate(216)" d="M0 0 C -11 8, -13 28, 0 38 C 13 28, 11 8, 0 0 Z" fill={EMBER} />
            <path transform="rotate(288)" d="M0 0 C -11 8, -13 28, 0 38 C 13 28, 11 8, 0 0 Z" fill={EMBER} />
            <circle r="5.5" fill={VOID} />
          </svg>
          <div style={{ fontSize: 34, letterSpacing: -0.5 }}>{meta.company}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 82,
              lineHeight: 1.02,
              letterSpacing: -3,
              maxWidth: 940,
            }}
          >
            {meta.tagline}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginTop: 40,
              fontSize: 24,
              color: STEEL,
            }}
          >
            <div style={{ width: 40, height: 2, background: BRASS }} />
            {meta.product.name} · {meta.product.label}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
