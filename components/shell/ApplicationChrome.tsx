"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CartProvider } from "@/components/cart/CartProvider";
import { Header } from "@/components/shell/Header";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { applicationRouteMode } from "@/lib/admin/routes";

export function ApplicationChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mode = applicationRouteMode(pathname);

  if (mode === "standard-admin") return children;

  const isHomepage = pathname === "/";

  return (
    <CartProvider key={mode} disabled={mode === "catalog-preview"}>
      <Header
        commerceDisabled={mode === "catalog-preview"}
        theme={isHomepage ? "light" : "dark"}
      />
      <main
        id="content"
        tabIndex={-1}
        data-header-layout={isHomepage ? "overlay" : "reserved"}
      >
        {children}
      </main>
      <SiteFooter />
    </CartProvider>
  );
}
