import type { CSSProperties } from "react";

const ink = "#111312";
const muted = "#5d5c55";
// The later editorial-commerce :root override is the active site accent.
const accent = "#183d34";
const line = "#d8d8dc";
const canvas = "#ffffff";
const displayFont = "Marcellus, Georgia, serif";

/**
 * Mirrors app/globals.css and app/layout.tsx: editorial display type, quiet
 * surfaces, fine rules and pill actions. Fonts fall back locally; no remote
 * fonts, CSS variables, grid or media queries are required. The wordmark PNG
 * is rasterized directly from public/brand/helix-wordmark-black.svg, with an
 * opaque white background to keep the black identity readable in dark clients.
 * Dimensional values use explicit pixels so the same styles work in Go HTML.
 */
export const emailDesign = {
  ink, muted, accent, line, canvas,
  // Advisory for clients that honor it; forced client recoloring can override it.
  colorScheme: "light only",
  // HTML fallback for mail clients that discard inline background CSS.
  canvasAttributes: { bgcolor: canvas },
  wordmarkPath: "/brand/helix-wordmark-email.png",
  wordmarkWidth: 128,
  wordmarkHeight: 53,
  body: { margin: 0, padding: 0, backgroundColor: canvas, color: ink, colorScheme: "light only", fontFamily: "Manrope, Arial, Helvetica, sans-serif", fontSize: "16px", lineHeight: "26px", WebkitTextSizeAdjust: "100%" } satisfies CSSProperties,
  outerCell: { padding: "24px 12px", backgroundColor: canvas } satisfies CSSProperties,
  container: { width: "100%", maxWidth: "600px", backgroundColor: canvas, borderCollapse: "collapse", tableLayout: "fixed" } satisfies CSSProperties,
  content: { padding: "36px 24px", backgroundColor: canvas, overflowWrap: "anywhere" } satisfies CSSProperties,
  heading: { color: ink, fontFamily: displayFont, fontWeight: 400, fontSize: "32px", lineHeight: "38px", margin: "0 0 20px" } satisfies CSSProperties,
  subheading: { color: ink, fontFamily: displayFont, fontWeight: 400, fontSize: "22px", lineHeight: "28px", margin: "32px 0 12px" } satisfies CSSProperties,
  wordmark: { margin: "0 0 32px", paddingBottom: "24px", borderBottom: `1px solid ${line}` } satisfies CSSProperties,
  wordmarkImage: { display: "block", width: "128px", height: "53px", border: 0, backgroundColor: canvas, color: ink } satisfies CSSProperties,
  eyebrow: { margin: "0 0 12px", color: muted, fontSize: "12px", lineHeight: "18px", letterSpacing: "1.2px", fontWeight: 700 } satisfies CSSProperties,
  paragraph: { margin: "0 0 16px", lineHeight: "26px" } satisfies CSSProperties,
  link: { color: accent, textDecoration: "underline", overflowWrap: "anywhere" } satisfies CSSProperties,
  // Borders provide the action's hit area even in clients that ignore link padding.
  button: { display: "inline-block", maxWidth: "100%", boxSizing: "border-box", borderTop: `14px solid ${accent}`, borderBottom: `14px solid ${accent}`, borderLeft: `24px solid ${accent}`, borderRight: `24px solid ${accent}`, borderRadius: "999px", backgroundColor: accent, color: "#fbfaf6", fontSize: "14px", lineHeight: "24px", fontWeight: 600, textAlign: "center", textDecoration: "none", overflowWrap: "anywhere" } satisfies CSSProperties,
  action: { margin: "24px 0" } satisfies CSSProperties,
  footer: { margin: "32px 0 0", paddingTop: "24px", borderTop: `1px solid ${line}`, color: muted, fontSize: "14px", lineHeight: "22px", overflowWrap: "anywhere" } satisfies CSSProperties,
  preheader: { display: "none", maxHeight: 0, overflow: "hidden", opacity: 0, fontSize: "1px", lineHeight: "1px" } satisfies CSSProperties,
};

/** Only serialize our trusted shared styles, never customer-supplied CSS. */
export function emailStyle(style: CSSProperties): string {
  return Object.entries(style).map(([property, value]) =>
    `${property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value}`,
  ).join(";");
}
