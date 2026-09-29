"use client";

import { useRef, useState } from "react";
import { ProductWaitlistSheet } from "@/components/product-detail/ProductWaitlistSheet";

export function ProductWaitlistVerification() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <section className="container">
      <h1>Product notification verification</h1>
      <p>Synthetic Product for local interface verification.</p>
      <button
        ref={trigger}
        type="button"
        className="btn"
        onClick={() => setOpen(true)}
      >
        Join the waitlist
      </button>
      <ProductWaitlistSheet
        open={open}
        onClose={() => setOpen(false)}
        returnFocus={() => trigger.current?.focus()}
        productId="123e4567-e89b-42d3-a456-426614174141"
        productName="Verification Serum"
      />
    </section>
  );
}
