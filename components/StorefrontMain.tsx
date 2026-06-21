"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type HeaderLayoutMode = "overlay" | "reserved";

export function StorefrontMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const headerLayout: HeaderLayoutMode = pathname === "/" ? "overlay" : "reserved";

  return (
    <main id="content" tabIndex={-1} data-header-layout={headerLayout}>
      {children}
    </main>
  );
}
