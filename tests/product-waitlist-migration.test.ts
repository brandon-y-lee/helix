import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260810152158_private_product_waitlist.sql",
  ),
  "utf8",
);
const hardeningSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260810213630_harden_product_waitlist_abuse_controls.sql",
  ),
  "utf8",
);

describe("private Product waitlist migration", () => {
  it("keeps enrollment, consent, and abuse data private and service-bound", () => {
    expect(sql).toContain("create table private.product_waitlist_enrollments");
    expect(sql).toContain("create table private.product_waitlist_consent_events");
    expect(sql).toContain("create table private.product_waitlist_rate_limits");
    expect(sql.match(/force row level security/g)).toHaveLength(3);
    expect(sql).toMatch(
      /revoke all on function public\.enroll_product_waitlist\([\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.enroll_product_waitlist\([\s\S]*?to service_role;/,
    );
  });

  it("makes enrollment retry-safe, consent append-only, and throttling durable", () => {
    expect(sql).toContain("unique (product_id, normalized_email)");
    expect(sql).toContain("product_waitlist_consent_events_append_only");
    expect(sql).toContain("before update or delete");
    expect(sql).toContain("on conflict (product_id, normalized_email) do update");
    expect(sql).toContain("on conflict (enrollment_id, policy_version, source) do nothing");
    expect(sql).toContain("return jsonb_build_object('ok', false, 'code', 'rate_limited')");
    expect(hardeningSql).toContain(
      "create index product_waitlist_rate_limits_updated_at_idx",
    );
    expect(hardeningSql).toContain("interval '24 hours'");
    expect(hardeningSql).toContain("for update skip locked");
  });

  it("allows waitlist catalog status only when the canonical draft has no Offers", () => {
    expect(sql).toContain("'sold_out', 'waitlist'");
    expect(sql).toContain("v_product.status = 'waitlist'");
    expect(sql).toContain("jsonb_array_length(v_document -> 'variants') <> 0");
  });
});
