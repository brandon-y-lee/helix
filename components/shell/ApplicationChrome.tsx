"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CartDrawerHost } from "@/components/cart/CartDrawer";
import { CartProvider } from "@/components/cart/CartProvider";
import { Header } from "@/components/shell/Header";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { applicationRouteMode } from "@/lib/admin/routes";

export function ApplicationChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mode = applicationRouteMode(pathname);
  const isPdpVerification = pathname === "/helix-verification/pdp-purchase";
  const isCustomerVerification = [
    "/helix-verification/customer/account",
    "/helix-verification/customer/rewards",
    "/helix-verification/customer/auth",
    "/helix-verification/customer/order",
  ].includes(pathname);
  const commerceDisabled = mode === "catalog-preview" || isPdpVerification || isCustomerVerification;
  const frameStorefrontPage =
    mode === "storefront" &&
    pathname !== "/" &&
    !pathname.startsWith("/products/") &&
    !isPdpVerification;

  if (mode === "standard-admin") return children;

  return (
    <CartProvider key={`${mode}:${commerceDisabled}`} disabled={commerceDisabled}>
      <Header commerceDisabled={commerceDisabled} />
      <main
        id="content"
        tabIndex={-1}
        data-storefront-main=""
      >
        {frameStorefrontPage ? (
          <div className="storefront-page-frame" data-viewport-page="">
            {children}
          </div>
        ) : (
          children
        )}
      </main>
      <SiteFooter />
      {!commerceDisabled && <CartDrawerHost />}
    </CartProvider>
  );
}
