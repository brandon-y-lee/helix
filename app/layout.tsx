import type { Metadata } from "next";
import { Manrope, Marcellus } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";
import { CartProvider } from "@/components/CartProvider";
import { Header } from "@/components/Header";

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
  title: "Mei-Pelle — Prestige Skincare for Men",
  description:
    "An original, focused men's skincare routine. Cleanse, treat, hydrate, and protect.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${marcellus.variable}`}>
      <body>
        <CartProvider>
          <Header />
          <main id="content">{children}</main>
          <footer className="site-footer">
            <div className="container site-footer__bar">
              <span>&copy; Mei-Pelle — development storefront.</span>
              <nav className="site-footer__nav" aria-label="Footer navigation">
                <Link href="/products">Shop</Link>
                <Link href="/method">Method</Link>
                <Link href="/about">About</Link>
              </nav>
              <span>Placeholder products &amp; copy. Not for sale.</span>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
