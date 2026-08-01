import "server-only";

import { cookies } from "next/headers";
import { CART_IDENTITY_CHANGED_COOKIE } from "@/lib/cart/sync";

export async function markCartIdentityChanged(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CART_IDENTITY_CHANGED_COOKIE, "1", {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 5 * 60,
  });
}
