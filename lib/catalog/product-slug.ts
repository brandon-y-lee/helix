export const PRODUCT_SLUG_MAX_LENGTH = 120;
export const PRODUCT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidProductSlug(value: string): boolean {
  return (
    value.length <= PRODUCT_SLUG_MAX_LENGTH &&
    PRODUCT_SLUG_PATTERN.test(value)
  );
}
