import type { Metadata } from "next";
import CatalogEditor from "@/components/admin/catalog-editor/CatalogEditor";

export const metadata: Metadata = {
  title: "Edit Catalog Product | Mei Pelle Admin",
};

export default async function AdminCatalogProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <CatalogEditor productId={productId} />;
}
