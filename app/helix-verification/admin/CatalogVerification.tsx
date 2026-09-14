"use client";

import { useMemo } from "react";
import CatalogEditor from "@/components/admin/catalog-editor/CatalogEditor";
import CatalogProductGrid from "@/components/admin/catalog-editor/CatalogProductGrid";
import { VerificationAdminShell } from "./VerificationAdminShell";
import { createVerificationCatalogApi, type CatalogVerificationState } from "./catalog-api";
import { catalogDocument } from "./catalog-data";

export function CatalogVerification({ view, state }: { view: "catalog" | "editor"; state: CatalogVerificationState }) {
  const api = useMemo(() => createVerificationCatalogApi(state), [state]);
  return (
    <VerificationAdminShell viewPath="/admin/catalog">
      {view === "editor" ? <CatalogEditor productId={catalogDocument.productId} api={api} /> : <CatalogProductGrid api={api} />}
    </VerificationAdminShell>
  );
}
