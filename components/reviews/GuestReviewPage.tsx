"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ReviewForm } from "./ReviewForm";
import type { OwnedReview } from "@/lib/reviews/contract";
const validToken = /^[A-Za-z0-9_-]{43}$/;
export function GuestReviewPage({
  transport = fetch,
}: {
  transport?: typeof fetch;
}) {
  const token = useRef<string | null>(null);
  const generation = useRef(0);
  const [purchases, setPurchases] = useState<OwnedReview[]>([]);
  const [message, setMessage] = useState("Opening your private review link…");
  useEffect(() => {
    let active = true;
    function openLink(reuseCaptured = false) {
      const current = ++generation.current;
      const value = window.location.hash
        ? new URLSearchParams(window.location.hash.slice(1)).get("token")
        : reuseCaptured
          ? token.current
          : null;
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      );
      token.current = null;
      setPurchases([]);
      if (!value || !validToken.test(value)) {
        setMessage(
          "Reopen the original review link from your email. If it has expired, contact support for help managing your review.",
        );
        return;
      }
      token.current = value;
      setMessage("Opening your private review link…");
      void transport("/api/reviews/guest/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: value }),
      })
        .then(async (response) => {
          const data = await response.json();
          if (!active || current !== generation.current) return;
          if (!response.ok || !data.ok || !Array.isArray(data.result))
            throw new Error(
              data.error ?? "Reviews are temporarily unavailable.",
            );
          setPurchases(data.result);
          setMessage(
            data.result.length
              ? "Your honest experience is welcome, positive or negative."
              : "No products are available to review from this link.",
          );
        })
        .catch((error) => {
          if (active && current === generation.current) {
            token.current = null;
            setMessage(
              error instanceof Error
                ? error.message
                : "Reviews are temporarily unavailable.",
            );
          }
        });
    }
    const changed = () => openLink();
    window.addEventListener("hashchange", changed);
    openLink(true);
    return () => {
      active = false;
      window.removeEventListener("hashchange", changed);
    };
  }, [transport]);
  const guestTransport: typeof fetch = async (input, init) => {
    if (!token.current)
      return Response.json(
        { error: "Reopen your review link." },
        { status: 403 },
      );
    const current = generation.current;
    const response = await transport(input, {
      ...init,
      body: JSON.stringify({
        ...JSON.parse(String(init?.body)),
        token: token.current,
      }),
    });
    if (current !== generation.current)
      return Response.json(
        { error: "A different review link was opened." },
        { status: 409 },
      );
    return response;
  };
  return (
    <main className="review-page" id="content">
      <Link href="/" prefetch={false} aria-label="helix home">
        helix
      </Link>
      <h1>Review your purchase</h1>
      <p role="status">{message}</p>
      <p>
        No account is required. Keep this link private. If you reload, reopen
        the original email link while it is valid. For help after expiry,{" "}
        <Link href="/contact" prefetch={false}>
          contact support
        </Link>
        .
      </p>
      {purchases.map((purchase) => (
        <ReviewForm
          key={purchase.orderItemId}
          purchase={purchase}
          transport={guestTransport}
          endpointPrefix="/api/reviews/guest"
        />
      ))}
    </main>
  );
}
