"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CartProvider } from "@/components/CartProvider";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { StorefrontMain } from "@/components/StorefrontMain";

export function ApplicationChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute =
    pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdminRoute) return children;

  return (
    <CartProvider>
      <Header />
      <StorefrontMain>{children}</StorefrontMain>
      <SiteFooter />
    </CartProvider>
  );
}
