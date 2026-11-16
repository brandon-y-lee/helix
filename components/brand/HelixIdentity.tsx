import type { SVGProps } from "react";
import { HELIX_IDENTITY_GEOMETRY } from "./HelixIdentity.geometry";
import styles from "./HelixIdentity.module.css";

type HelixIdentityVariant = "wordmark" | "symbol";

type HelixIdentityProps = Omit<
  SVGProps<SVGSVGElement>,
  "aria-label" | "children"
> & {
  variant?: HelixIdentityVariant;
  decorative?: boolean;
  label?: string;
};

function HelixSymbolGeometry() {
  return (
    <>
      {HELIX_IDENTITY_GEOMETRY.symbol.map(
        ({ d, strokeWidth, strokeLinecap }) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap={strokeLinecap}
          />
        ),
      )}
    </>
  );
}

function HelixTailGeometry() {
  return (
    <g
      fill="currentColor"
      transform={HELIX_IDENTITY_GEOMETRY.tailTransform}
    >
      {HELIX_IDENTITY_GEOMETRY.tail.map(({ d, transform }) => (
        <path key={d} d={d} transform={transform} />
      ))}
    </g>
  );
}

export function HelixIdentity({
  variant = "wordmark",
  decorative = false,
  label = "helix",
  className,
  ...svgProps
}: HelixIdentityProps) {
  const accessibilityProps = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ "aria-label": label, role: "img" } as const);

  return (
    <svg
      {...svgProps}
      {...accessibilityProps}
      className={[styles.identity, className].filter(Boolean).join(" ")}
      data-helix-identity={variant}
      viewBox={HELIX_IDENTITY_GEOMETRY.viewBox[variant]}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g aria-hidden="true">
        <HelixSymbolGeometry />
        {variant === "wordmark" ? <HelixTailGeometry /> : null}
      </g>
    </svg>
  );
}
