import type {
  CatalogValidationIssue,
  ProductEditorDocumentV4,
} from "@/lib/admin/catalog/types";
import { isCurrentProductMediaUrl } from "@/lib/catalog/media-storage";

/** Readiness is separate from hydration so restored media remains repairable. */
export function validateCurrentProductMedia(
  document: ProductEditorDocumentV4,
): CatalogValidationIssue[] {
  return document.media.flatMap((media, index) => {
    if (
      (media.url === null && media.media_type === "image") ||
      (media.url !== null && isCurrentProductMediaUrl(media.url, document.productId))
    ) {
      return [];
    }
    return [
      {
        path: `media.${index}.url`,
        code: "retired_media_reference",
        message:
          "Choose approved media from this Product’s current UUID folder before marking Ready or publishing.",
      },
    ];
  });
}
