import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ noStore: vi.fn(), rpc: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_noStore: mocks.noStore,
  revalidateTag: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/admin/capabilities", () => ({
  ADMIN_CAPABILITIES: {},
  checkAdminCapability: vi.fn(),
}));
import { readReviewPage } from "@/lib/reviews/server";
it("fresh authoritative reads reflect a later offer without review edits or cache expiration", async () => {
  let offered = false;
  mocks.rpc.mockImplementation(() => ({
    abortSignal: async () => ({
      error: null,
      data: {
        count: 1,
        average: 1,
        nextCursor: null,
        reviews: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            displayName: "Alex",
            rating: 1,
            title: "Experience",
            body: "My honest experience",
            date: "2026-11-01",
            verifiedPurchase: true,
            offerNotice: offered,
          },
        ],
      },
    }),
  }));
  expect((await readReviewPage("serum")).reviews[0].offerNotice).toBe(false);
  offered = true;
  expect((await readReviewPage("serum")).reviews[0].offerNotice).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  expect(mocks.noStore).toHaveBeenCalledTimes(2);
});
