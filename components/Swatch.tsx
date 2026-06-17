import type { CSSProperties } from "react";

/**
 * Decorative gradient panel used in place of product photography during
 * development. Purely visual; marked aria-hidden.
 */
export function Swatch({
  colors,
  className,
  style,
}: {
  colors: [string, string];
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        background: `linear-gradient(150deg, ${colors[0]} 0%, ${colors[1]} 100%)`,
        ...style,
      }}
    />
  );
}
