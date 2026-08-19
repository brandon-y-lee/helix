import type { SVGProps } from "react";
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

const primaryStrand =
  "M35 14 C33 40 34 56 48 67 C57 75 69 80 79 89 C94 103 99 125 98 151";
const secondaryStrand =
  "M29 151 C25 124 27 101 39 83 C40 82 40.8 80.3 41.7 79.3";

function HelixSymbolGeometry() {
  return (
    <>
      <path
        d={secondaryStrand}
        fill="none"
        stroke="currentColor"
        strokeWidth="9.5"
        strokeLinecap="butt"
      />
      <path
        d={primaryStrand}
        fill="none"
        stroke="currentColor"
        strokeWidth="12.5"
        strokeLinecap="butt"
      />
    </>
  );
}

function HelixTailGeometry() {
  return (
    <g fill="currentColor" transform="translate(101 151) scale(.0915 -.0915)">
      <path d="M602 -18Q491 -18 394 17Q297 52 225 119.5Q153 187 111.5 286.5Q70 386 70 514Q70 627 108 723.5Q146 820 213 891Q280 962 369.5 1002Q459 1042 563 1042Q666 1042 754 1006.5Q842 971 906.5 903.5Q971 836 1008.5 736.5Q1046 637 1049 510Q936 512 823 513Q710 514 588 514Q501 514 418.5 513Q336 512 270 510Q276 406 302.5 322Q329 238 375.5 178.5Q422 119 488.5 87Q555 55 639 55Q697 55 748.5 68.5Q800 82 842 106Q884 130 917 162.5Q950 195 973 233L985 227L911 49Q857 21 782 1.5Q707 -18 602 -18ZM469 592Q569 592 669.5 592.5Q770 593 852 596Q843 683 818 752Q793 821 754 869Q715 917 662 943Q609 969 545 969Q487 969 438.5 943.5Q390 918 354 870Q318 822 296 752.5Q274 683 270 594Q315 592 365 592Q415 592 469 592Z" />
      <path
        transform="translate(1110)"
        d="M160 1104Q160 1189 157.5 1252.5Q155 1316 151.5 1362Q148 1408 142.5 1439Q137 1470 131 1491V1495H362V1491Q356 1470 351 1439Q346 1408 342 1362Q338 1316 336 1252.5Q334 1189 334 1104V391Q334 306 336 242.5Q338 179 342 133Q346 87 351 56Q356 25 362 4V0H131V4Q137 25 142.5 56Q148 87 151.5 133Q155 179 157.5 242.5Q160 306 160 391Z"
      />
      <path
        transform="translate(1604)"
        d="M160 633Q160 718 157.5 781.5Q155 845 151.5 891Q148 937 142.5 968Q137 999 131 1020V1024H362V1020Q356 999 351 968Q346 937 342 891Q338 845 336 781.5Q334 718 334 633V391Q334 306 336 242.5Q338 179 342 133Q346 87 351 56Q356 25 362 4V0H131V4Q137 25 142.5 56Q148 87 151.5 133Q155 179 157.5 242.5Q160 306 160 391ZM139 1327Q139 1349 147.5 1368.5Q156 1388 170 1402.5Q184 1417 203.5 1425.5Q223 1434 246 1434Q269 1434 288.5 1425.5Q308 1417 322.5 1402.5Q337 1388 345.5 1368.5Q354 1349 354 1327Q354 1281 323 1250Q292 1219 246 1219Q223 1219 203.5 1227.5Q184 1236 170 1250.5Q156 1265 147.5 1284.5Q139 1304 139 1327Z"
      />
      <path
        transform="translate(2098)"
        d="M502 430L262 127Q249 110 235.5 92Q222 74 211.5 57Q201 40 194.5 25Q188 10 188 0H20V4Q36 18 64.5 46Q93 74 125 115L440 514L131 932Q105 966 80 990Q55 1014 43 1020V1024H317Q317 1007 329.5 970.5Q342 934 379 883L549 651L743 897Q755 913 767.5 931Q780 949 789.5 966.5Q799 984 805 999Q811 1014 811 1024H979V1020Q965 1009 944 988Q923 967 889 924L610 569L946 115Q980 70 1009 41Q1038 12 1051 4V0H778Q778 17 765 54.5Q752 92 717 141Z"
      />
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
      viewBox={variant === "symbol" ? "20 5 87 155" : "20 5 374 155"}
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
