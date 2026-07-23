export type FamiliarFaceMedia = {
  id: string;
  src: `/media/${string}`;
  alt: string;
  width: number;
  height: number;
  focalPosition?: string;
  href?: `/${string}`;
};

export const productEndorsementMedia = [
  {
    id: "why-three-portrait",
    src: "/media/home/why-three.webp",
    alt: "Black-and-white close editorial portrait.",
    width: 1013,
    height: 1350,
    focalPosition: "50% 34%",
  },
  {
    id: "system-hero-portrait",
    src: "/media/home/mei-pelle-hero-poster.webp",
    alt: "Black-and-white portrait of a model in a suit.",
    width: 1920,
    height: 1080,
    focalPosition: "50% 38%",
  },
  {
    id: "plug-and-play-portrait",
    src: "/media/home/plug-and-play-poster.webp",
    alt: "Close editorial portrait in a red jacket.",
    width: 1600,
    height: 899,
    focalPosition: "50% 40%",
  },
  {
    id: "final-campaign-portrait",
    src: "/media/home/final-cta-poster.webp",
    alt: "Editorial portrait of a model in a black jacket.",
    width: 1280,
    height: 720,
    focalPosition: "52% 38%",
  },
] as const satisfies readonly FamiliarFaceMedia[];

export function validFamiliarFaceMedia(
  items: readonly FamiliarFaceMedia[],
): FamiliarFaceMedia[] {
  return items.filter(
    (item) =>
      item.src.startsWith("/media/") &&
      item.alt.trim().length > 0 &&
      Number.isSafeInteger(item.width) &&
      item.width > 0 &&
      Number.isSafeInteger(item.height) &&
      item.height > 0,
  );
}
