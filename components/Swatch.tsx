import type { CSSProperties } from "react";
import type { PlaceholderPalette } from "@/lib/products";

/**
 * Decorative gradient panel used in place of product photography during
 * development. Purely visual; marked aria-hidden.
 */
export function Swatch({
  colors,
  palette,
  className,
  style,
}: {
  colors: [string, string];
  palette?: PlaceholderPalette | null;
  className?: string;
  style?: CSSProperties;
}) {
  const start = palette?.start ?? colors[0];
  const end = palette?.end ?? colors[1];
  const accent = palette?.accent ?? colors[1];
  const highlight = palette?.highlight ?? colors[0];

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        background: [
          `radial-gradient(circle at 22% 18%, ${highlight} 0%, transparent 28%)`,
          `radial-gradient(circle at 82% 82%, ${accent} 0%, transparent 32%)`,
          `linear-gradient(150deg, ${start} 0%, ${end} 100%)`,
        ].join(", "),
        ...style,
      }}
    />
  );
}
