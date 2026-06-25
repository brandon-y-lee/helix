import type { Metadata } from "next";
import { Manrope, Marcellus } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { CartProvider } from "@/components/CartProvider";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { StorefrontMain } from "@/components/StorefrontMain";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

const marcellus = Marcellus({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mei Pelle — Prestige Skincare for Men",
  description:
    "An original, focused men's skincare routine. Cleanse, treat, hydrate, and protect.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${marcellus.variable}`}>
      <body>
        <CartProvider>
          <Header />
          <StorefrontMain>
            {children}
          </StorefrontMain>
          <SiteFooter />
        </CartProvider>
      </body>
    </html>
  );
}
