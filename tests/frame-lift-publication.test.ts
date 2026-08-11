import { describe, expect, it } from "vitest";
import type { ProductEditorDocumentV4 } from "@/lib/admin/catalog/types";
import { validateProductEditorDocument } from "@/lib/admin/catalog/validation";
import { catalogDocument } from "@/tests/fixtures/catalog-editor";
import {
  FRAME_LIFT_PUBLICATIONS,
  buildFrameLiftPublicationDocument,
  isFrameLiftPublicationCurrent,
} from "@/lib/catalog/frame-lift-publication";

function sourceDocument(step: "FRAME" | "LIFT"): ProductEditorDocumentV4 {
  const document = structuredClone(catalogDocument) as ProductEditorDocumentV4;
  const publication = FRAME_LIFT_PUBLICATIONS[step];
  const isFrame = step === "FRAME";

  document.productId = publication.productId;
  document.product.id = publication.productId;
  document.product.slug = publication.sourceSlug;
  document.product.display_name = step;
  document.product.system_step_name = step;
  document.product.product_type = isFrame ? "Eye contour cream" : "Sheet mask";
  document.product.ingredients = isFrame
    ? "Water, Sodium DNA, Niacinamide, Panthenol, Allantoin, Acetyl Tetrapeptide-5, Acetyl Hexapeptide-8, Copper Tripeptide-1, Palmitoyl Pentapeptide-4"
    : "Water, Glycerin, Niacinamide, Sodium DNA (5,000 ppm), Allantoin, Adenosine, Hydrolyzed Collagen";
  document.product.volume = isFrame ? "20 mL" : "10 x 25 mL";
  document.productPdpContent!.product_id = publication.productId;
  document.variants[0]!.product_id = publication.productId;
  document.media = document.media.map((item, index) => ({
    ...item,
    product_id: publication.productId,
    url: `https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/${step.toLowerCase()}/${index}.webp`,
  }));
  document.relationships = [
    {
      product_id: publication.productId,
      related_product_id: "123e4567-e89b-42d3-a456-426614174099",
      relationship_type: "related",
      sort_order: 0,
      created_at: "2026-07-20T12:00:00.000Z",
      archived_at: null,
    },
  ];
  document.productSource = {
    ...document.productSource!,
    product_id: publication.productId,
    supplier_title: publication.sourceTitle,
    supplier_url: publication.sourceUrl,
    raw_source: {
      catalogProduct: { ingredients: document.product.ingredients },
      immutable: "supplier evidence",
    },
  };

  return document;
}

describe("FRAME and LIFT Catalog publication", () => {
  it.each([
    ["FRAME", "Peptide Eye Cream", "PDRN eye cream", "peptide-eye-cream"],
    ["LIFT", "Peptide Nourish Mask", "PDRN sheet mask", "peptide-nourish-mask"],
  ] as const)(
    "publishes %s with its approved identity and without an unverified Offer",
    (step, displayName, productType, slug) => {
      const before = sourceDocument(step);
      const after = buildFrameLiftPublicationDocument(before, step);

      expect(after.product).toMatchObject({
        display_name: displayName,
        product_type: productType,
        slug,
        system_step_name: step,
        routine_group: "beyond_core",
        status: "coming_soon",
        catalog_status: "active",
      });
      expect(after.variants).toEqual([]);
      expect(after.media).toEqual(before.media);
      expect(after.relationships).toEqual(before.relationships);
      expect(after.productSource?.raw_source).toEqual(
        before.productSource?.raw_source,
      );
      expect(after.productSource?.source_content_hash).toMatch(/^[a-f\d]{64}$/i);
      expect(after.product.skin_types).toEqual([]);
      expect(
        validateProductEditorDocument(after, {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL:
            "https://erasogmsqpgiirovubjh.supabase.co",
        }).issues,
      ).toEqual([]);
      expect(isFrameLiftPublicationCurrent(after, step)).toBe(true);
    },
  );

  it("keeps FRAME benefit-led while grounding peptide language in declared peptides", () => {
    const after = buildFrameLiftPublicationDocument(
      sourceDocument("FRAME"),
      "FRAME",
    );
    const publicCopy = JSON.stringify({
      product: after.product,
      pdp: after.productPdpContent,
    });

    expect(after.product.key_ingredients).toEqual(
      expect.arrayContaining(["Sodium DNA", "Acetyl Tetrapeptide-5"]),
    );
    expect(after.productSource?.formulation_version_notes).toContain(
      "No 2% concentration claim is approved",
    );
    expect(publicCopy).not.toMatch(/\b2%\b|rejuvenat|medical|clinical/i);
    expect(publicCopy).toMatch(/soft|smooth|supple|rested/i);
  });

  it("uses separately declared Hydrolyzed Collagen as LIFT's only peptide-name basis", () => {
    const after = buildFrameLiftPublicationDocument(
      sourceDocument("LIFT"),
      "LIFT",
    );
    const publicCopy = JSON.stringify({
      product: after.product,
      pdp: after.productPdpContent,
    });

    expect(after.product.ingredients).toContain("Sodium DNA");
    expect(after.product.ingredients).not.toContain("Sodium DNA (5,000 ppm)");
    expect(after.productSource?.formulation_version_notes).toContain(
      "Hydrolyzed Collagen separately from Sodium DNA",
    );
    expect(after.productSource?.formulation_version_notes).toContain(
      "PDRN is not a peptide",
    );
    expect(publicCopy).not.toMatch(/lifting|\b0\.5%\b|rejuvenat|medical|clinical/i);
    expect(publicCopy).toMatch(/Hydrolyzed Collagen/);
    expect(after.productSource?.raw_source).toHaveProperty(
      "catalogProduct.ingredients",
      expect.stringContaining("Hydrolyzed Collagen"),
    );
  });

  it("fails closed when immutable supplier or Formula evidence is different", () => {
    const wrongSource = sourceDocument("LIFT");
    wrongSource.productSource!.supplier_title = "Different supplier product";

    expect(() =>
      buildFrameLiftPublicationDocument(wrongSource, "LIFT"),
    ).toThrow(/supplier evidence/i);

    const wrongFormula = sourceDocument("FRAME");
    wrongFormula.product.ingredients = "Water, Sodium DNA";

    expect(() =>
      buildFrameLiftPublicationDocument(wrongFormula, "FRAME"),
    ).toThrow(/Formula evidence/i);

    const missingGovernedEvidence = sourceDocument("LIFT");
    missingGovernedEvidence.productSource!.source_content_hash = null;
    expect(() =>
      buildFrameLiftPublicationDocument(missingGovernedEvidence, "LIFT"),
    ).toThrow(/governed supplier Formula evidence/i);
  });

  it("is deterministic and recognizes a completed publication for safe retries", () => {
    const published = buildFrameLiftPublicationDocument(
      sourceDocument("LIFT"),
      "LIFT",
    );

    expect(buildFrameLiftPublicationDocument(published, "LIFT")).toEqual(
      published,
    );
    expect(isFrameLiftPublicationCurrent(published, "LIFT")).toBe(true);
    published.product.seo_title = "stale";
    expect(isFrameLiftPublicationCurrent(published, "LIFT")).toBe(false);
  });

  it("recognizes structurally identical published JSON after key reordering", () => {
    const published = buildFrameLiftPublicationDocument(
      sourceDocument("FRAME"),
      "FRAME",
    );
    const content = published.productPdpContent;
    if (!content?.ingredient_cards) {
      throw new Error("Expected FRAME PDP ingredient cards.");
    }
    content.ingredient_cards = content.ingredient_cards.map((card) => ({
        copy: card.copy,
        label: card.label,
        name: card.name,
      }));

    expect(isFrameLiftPublicationCurrent(published, "FRAME")).toBe(true);
  });
});
