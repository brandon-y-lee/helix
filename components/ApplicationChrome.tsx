"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CartDrawerHost } from "@/components/CartDrawer";
import { CartProvider } from "@/components/CartProvider";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { StorefrontMain } from "@/components/StorefrontMain";
import { applicationRouteMode } from "@/lib/admin/routes";

export function ApplicationChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mode = applicationRouteMode(pathname);

  if (mode === "standard-admin") return children;

  return (
    <CartProvider key={mode} disabled={mode === "catalog-preview"}>
      <Header commerceDisabled={mode === "catalog-preview"} />
      <StorefrontMain>{children}</StorefrontMain>
      <SiteFooter />
      {mode !== "catalog-preview" && <CartDrawerHost />}
    </CartProvider>
  );
}
