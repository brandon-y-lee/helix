import type {
  CatalogValidationIssue,
  ProductEditorDocumentV4,
} from "@/lib/admin/catalog/types";

// Readiness is separate from document shape: incomplete drafts must stay editable.
export function catalogGuidanceValidationIssues(
  document: ProductEditorDocumentV4,
): CatalogValidationIssue[] {
  const steps = document.productPdpContent?.how_to_use_steps;
  if (steps === null || steps === undefined) {
    return [{
      path: "productPdpContent.how_to_use_steps",
      code: "guidance_review_required",
      message: "Review the usage instructions before Publish. Add approved steps or explicitly confirm that no How to Use section is intended.",
    }];
  }
  if (!Array.isArray(steps) || steps.some((step) => typeof step !== "string" || !step.trim())) {
    return [{
      path: "productPdpContent.how_to_use_steps",
      code: "guidance_invalid_steps",
      message: "Each usage instruction must contain text. Remove empty steps or explicitly confirm that no How to Use section is intended.",
    }];
  }
  return [];
}
