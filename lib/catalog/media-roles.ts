export const PRODUCT_MEDIA_ROLES = [
  "card",
  "hero",
  "gallery",
  "detail",
  "card_default",
  "card_hover",
  "cart",
  "search",
  "routine_video",
  "routine_video_poster",
  "profile_editorial",
  "ingredients_texture",
  "core_routine_texture",
  "core_routine_editorial",
  "pdp_outcome",
  "pdp_application",
] as const;

export type ProductMediaRole = (typeof PRODUCT_MEDIA_ROLES)[number];

export function isProductMediaRole(role: string): role is ProductMediaRole {
  return (PRODUCT_MEDIA_ROLES as readonly string[]).includes(role);
}

export const CORE_ROUTINE_MEDIA_SLOTS = [
  {
    role: "core_routine_texture",
    label: "Core Routine Texture",
    helperText: "Ingredient/texture swatch used inside the left routine panel.",
    defaultSortOrder: 24,
  },
  {
    role: "core_routine_editorial",
    label: "Core Routine Editorial Image",
    helperText:
      "Large supporting image used by the shared interactive Core routine section across all Core PDPs.",
    defaultSortOrder: 1,
  },
] as const satisfies ReadonlyArray<{
  role: ProductMediaRole;
  label: string;
  helperText: string;
  defaultSortOrder: number;
}>;

export type CoreRoutineMediaRole =
  (typeof CORE_ROUTINE_MEDIA_SLOTS)[number]["role"];

export function isCoreRoutineMediaRole(
  role: string,
): role is CoreRoutineMediaRole {
  return CORE_ROUTINE_MEDIA_SLOTS.some((slot) => slot.role === role);
}
