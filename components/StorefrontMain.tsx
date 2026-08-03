import type { ReactNode } from "react";

export type HeaderLayoutMode = "overlay" | "reserved";

export function StorefrontMain({
  children,
  headerLayout,
}: {
  children: ReactNode;
  headerLayout: HeaderLayoutMode;
}) {
  return (
    <main id="content" tabIndex={-1} data-header-layout={headerLayout}>
      {children}
    </main>
  );
}
