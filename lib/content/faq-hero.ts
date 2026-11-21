import { CATALOG_MEDIA_BUCKET, catalogMediaOrigin } from "@/lib/catalog/media-storage";

/** Immutable, project-owned editorial image; separate from Product Media. */
export const FAQ_HERO_IMAGE =
  `${catalogMediaOrigin()}/storage/v1/object/public/${CATALOG_MEDIA_BUCKET}/pages/faq/hero/13df364513afd448dd571acd4f8efd29084e59aff7956c7fd5d332549cd4b773.webp`;
