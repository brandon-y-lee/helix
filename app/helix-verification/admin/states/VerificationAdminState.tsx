"use client";

import { useState } from "react";
import { AdminAccessState } from "@/components/admin/shell/AdminAccessState";
import AdminLoading from "@/app/admin/loading";
import AdminError from "@/app/admin/error";
import { VerificationAdminShell } from "../VerificationAdminShell";

export function VerificationAdminState({
  scenario,
}: {
  scenario: "forbidden" | "unavailable" | "loading" | "error";
}) {
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  if (scenario === "error") {
    return (
      <VerificationAdminShell>
        <AdminError
          reset={() => setActionNotice("Retry is disabled for synthetic verification.")}
        />
        {actionNotice ? <p role="status">{actionNotice}</p> : null}
      </VerificationAdminShell>
    );
  }

  return (
    <div data-verification-fixture="admin-states">
      <p className="admin-dashboard__eyebrow">
        Synthetic verification · No account changes
      </p>
      {scenario === "loading" ? (
        <AdminLoading />
      ) : (
        <AdminAccessState
          state={scenario}
          signOutControl={
            <div>
              <button
                type="button"
                className="btn btn--ghost btn--sm btn--editorial-rounded account-signout"
                onClick={() => setActionNotice("Sign out is disabled for synthetic verification.")}
              >
                Sign out
              </button>
              {actionNotice ? <p role="status">{actionNotice}</p> : null}
            </div>
          }
        />
      )}
    </div>
  );
}
