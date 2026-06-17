import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { CartProvider } from "@/components/CartProvider";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Mei Pelle — Prestige Skincare for Men",
  description:
    "An original, focused men's skincare routine. Cleanse, treat, hydrate, and protect.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CartProvider>
          <Header />
          <main>{children}</main>
          <footer className="site-footer">
            <div className="container site-footer__bar">
              <span>&copy; Mei Pelle — development storefront.</span>
              <span>Placeholder products &amp; copy. Not for sale.</span>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
