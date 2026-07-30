import "server-only";

import {
  getCoreRoutineContentSummaries,
  getPdpProductContent,
  getProductOffer,
  getProductOffers,
} from "@/lib/catalog/storefront";
import type {
  CoreRoutineSummary,
  PdpProduct,
} from "@/lib/catalog/models";

export type CatalogPreviewBase = {
  product: PdpProduct;
  coreProducts: CoreRoutineSummary[];
};

export async function loadCatalogPreviewBase(
  publishedSlug: string,
): Promise<CatalogPreviewBase | null> {
  const [content, offer] = await Promise.all([
    getPdpProductContent(publishedSlug),
    getProductOffer(publishedSlug),
  ]);
  if (!content || !offer || content.id !== offer.id) return null;

  const product: PdpProduct = { ...content, ...offer };
  if (product.routineGroup !== "core") {
    return { product, coreProducts: [] };
  }

  const [coreContents, offers] = await Promise.all([
    getCoreRoutineContentSummaries(),
    getProductOffers(),
  ]);
  const offerById = new Map(offers.map((item) => [item.id, item]));
  const coreProducts = coreContents.flatMap((item) => {
    const coreOffer = offerById.get(item.id);
    return coreOffer ? [{ ...item, ...coreOffer }] : [];
  });

  return { product, coreProducts };
}
