"use client";
import { useEffect, useMemo, useState } from "react";
import { PrivacyMeasurement } from "@/components/privacy/PrivacyMeasurement";
export function PrivacyVerification() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const config = useMemo(
    () => ({
      origin,
      gaEnabled: true,
      metaEnabled: true,
      gaId: "G-HELIXTEST",
      metaId: "000000000000001",
      webAnalytics: true,
      speedInsights: true,
      verification: true,
    }),
    [origin],
  );
  return (
    <>
      <p>
        Synthetic public identifiers and local-only SDK substitutes. This page
        never loads vendor scripts or sends provider events.
      </p>
      {origin && <PrivacyMeasurement config={config} />}
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(new Event("helix-privacy-verification-metric"))
        }
      >
        Emit synthetic metric
      </button>
      <button
        type="button"
        onClick={() => {
          window.history.pushState(
            null,
            "",
            "/account?token=synthetic-private",
          );
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
      >
        Enter private context
      </button>
    </>
  );
}
