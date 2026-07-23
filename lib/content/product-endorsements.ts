export type ApprovedProductEndorsement = {
  id: string;
  src: `/media/${string}`;
  alt: string;
  width: number;
  height: number;
  approvedForEndorsement: true;
  href?: `/${string}`;
};

export const productEndorsementMedia = [] as const satisfies readonly ApprovedProductEndorsement[];

export function approvedProductEndorsements(
  items: readonly ApprovedProductEndorsement[],
): ApprovedProductEndorsement[] {
  return items.filter(
    (item) =>
      item.approvedForEndorsement &&
      item.src.startsWith("/media/") &&
      item.alt.trim().length > 0 &&
      Number.isSafeInteger(item.width) &&
      item.width > 0 &&
      Number.isSafeInteger(item.height) &&
      item.height > 0,
  );
}
