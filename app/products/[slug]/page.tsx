import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Product | Mei Pelle",
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <article>
      <h1>{slug}</h1>
      <p>Product detail placeholder for &ldquo;{slug}&rdquo;.</p>
    </article>
  );
}
