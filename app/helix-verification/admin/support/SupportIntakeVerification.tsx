"use client";

import { useMemo } from "react";
import { ContactForm } from "@/components/support/ContactForm";

export type SupportIntakeScenario = "photos" | "upload-retry";
const uploadRoot = "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/upload/sign/support-photo-quarantine/synthetic/";

// All responses are local. Unknown requests throw instead of reaching a service.
export function createSupportIntakeRequest(scenario: SupportIntakeScenario): typeof fetch {
  let uploadFailed = false;
  let accepted = false;
  const admissions = new Map<string, { photoId: string; uploadUrl: string }>();
  const response = (value: unknown) => Response.json(value);
  return async (input, options) => {
    if (typeof input !== "string") throw new Error("Unsupported synthetic request");
    const method = options?.method ?? "GET";
    if (input === "/api/support/intake" && method === "GET") return response({ available: true, photosAvailable: true });
    if (input === "/api/support/intake" && method === "POST" && !accepted) {
      accepted = true;
      return response({ ok: true });
    }
    if (method === "PUT" && [...admissions.values()].some((item) => item.uploadUrl === input)) {
      if (scenario === "upload-retry" && !uploadFailed) {
        uploadFailed = true;
        throw new Error("Synthetic upload response lost");
      }
      return new Response(null, { status: 200 });
    }
    if (input !== "/api/support/photos" || method !== "POST" || !accepted || typeof options?.body !== "string") {
      throw new Error("Unsupported synthetic request");
    }
    const body = JSON.parse(options.body) as { action: string; uploadId?: string; photoId?: string };
    if (body.action === "admit" && typeof body.uploadId === "string" && admissions.size < 5) {
      const photoId = `synthetic-photo-${admissions.size + 1}`;
      const admission = { photoId, uploadUrl: `${uploadRoot}${photoId}?token=synthetic-unused-token` };
      admissions.set(body.uploadId, admission);
      return response({ ok: true, ...admission });
    }
    if (body.action === "complete" && [...admissions.values()].some((item) => item.photoId === body.photoId)) {
      return response({ ok: true, status: "processing" });
    }
    if (body.action === "status") return response({ ok: true, photos: [...admissions.entries()].map(([uploadId, photo], index) => ({
      id: photo.photoId, uploadId, status: index === 0 ? "ready" : "rejected", rejectionReason: index === 0 ? null : "unsupported_image",
    })) });
    throw new Error("Unsupported synthetic request");
  };
}

export function SupportIntakeVerification({ scenario }: { scenario: SupportIntakeScenario }) {
  const request = useMemo(() => createSupportIntakeRequest(scenario), [scenario]);
  return <ContactForm request={request} />;
}
