import "server-only";

import {
  getCoreRoutineContentSummaries,
  getPdpProductContent,
  getProductOffer,
  getProductOffers,
  getSystemSteps,
} from "@/lib/catalog/storefront";
import type {
  CoreRoutineSummary,
  PdpProduct,
} from "@/lib/catalog/models";
import type { GovernedSystemStep } from "@/lib/catalog/system-steps";

export type CatalogPreviewBase = {
  product: PdpProduct;
  coreProducts: CoreRoutineSummary[];
  systemSteps: GovernedSystemStep[];
};

export async function loadCatalogPreviewBase(
  publishedSlug: string,
): Promise<CatalogPreviewBase | null> {
  const [content, offer, systemSteps] = await Promise.all([
    getPdpProductContent(publishedSlug),
    getProductOffer(publishedSlug),
    getSystemSteps(),
  ]);
  if (!content || !offer || content.id !== offer.id) return null;

  const product: PdpProduct = { ...content, ...offer };
  if (product.routineGroup !== "core") {
    return { product, coreProducts: [], systemSteps };
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

  return { product, coreProducts, systemSteps };
}
