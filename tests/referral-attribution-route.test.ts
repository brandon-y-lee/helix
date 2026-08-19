import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: dependencies.createSupabaseAdminClient,
}));

import { GET } from "@/app/r/[code]/route";
import { REFERRAL_COOKIE } from "@/lib/referrals/constants";

function referralLookup(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("Referral Attribution route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records an accepted Referral Code in the helix browser identifier", async () => {
    const query = referralLookup({
      data: { code: "HELIX25", active: true },
      error: null,
    });
    const from = vi.fn(() => query);
    dependencies.createSupabaseAdminClient.mockReturnValue({ from });

    const response = await GET(
      new Request("https://helixskin.vercel.app/r/helix25"),
      { params: Promise.resolve({ code: " helix-25 " }) },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://helixskin.vercel.app/collections/shop?referral=accepted",
    );
    expect(response.headers.get("set-cookie")).toContain(
      `${REFERRAL_COOKIE}=HELIX25`,
    );
    expect(response.headers.get("set-cookie")).not.toContain(
      "mei_pelle_referral_code=HELIX25",
    );
    expect(from).toHaveBeenCalledWith("referral_codes");
  });

  it("rejects malformed browser input before the referral lookup", async () => {
    const from = vi.fn();
    dependencies.createSupabaseAdminClient.mockReturnValue({ from });

    const response = await GET(
      new Request("https://helixskin.vercel.app/r/no"),
      { params: Promise.resolve({ code: "no" }) },
    );

    expect(response.headers.get("location")).toBe(
      "https://helixskin.vercel.app/collections/shop?referral=invalid",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("reports a retryable outage instead of calling provider failure invalid", async () => {
    const query = referralLookup({
      data: null,
      error: { message: "provider leaked customer@example.test" },
    });
    dependencies.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => query),
    });

    const response = await GET(
      new Request("https://helixskin.vercel.app/r/helix25"),
      { params: Promise.resolve({ code: "helix25" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(body).toEqual({
      error: {
        code: "REFERRAL_SERVICE_UNAVAILABLE",
        message: "Referral Code validation is temporarily unavailable.",
        retryable: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain("customer@example.test");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
