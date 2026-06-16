import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Mei Pelle",
  description: "Ecommerce platform baseline application shell.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header>
          <nav aria-label="Primary">
            <ul>
              <li>
                <Link href="/">Home</Link>
              </li>
              <li>
                <Link href="/products">Products</Link>
              </li>
              <li>
                <Link href="/cart">Cart</Link>
              </li>
              <li>
                <Link href="/checkout">Checkout</Link>
              </li>
              <li>
                <Link href="/account">Account</Link>
              </li>
              <li>
                <Link href="/admin">Admin</Link>
              </li>
            </ul>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>Mei Pelle baseline shell &mdash; placeholder footer.</p>
        </footer>
      </body>
    </html>
  );
}
