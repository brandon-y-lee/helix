import type { Metadata } from "next";
import { Manrope, Marcellus } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { ApplicationChrome } from "@/components/shell/ApplicationChrome";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";
import { resolvePublicSiteOrigin } from "@/lib/site-url";

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
  ...createPublicSiteMetadata({
    title: "helix — Prestige Skincare for Men",
    description:
      "An original, focused men's skincare routine. Cleanse, treat, hydrate, and protect.",
    canonical: "/",
  }),
  metadataBase: new URL(resolvePublicSiteOrigin()),
  applicationName: "helix",
  icons: {
    icon: [
      {
        url: "/brand/helix-symbol-black.svg",
        type: "image/svg+xml",
      },
    ],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${marcellus.variable}`}>
      <body>
        <ApplicationChrome>{children}</ApplicationChrome>
      </body>
    </html>
  );
}
