import { createHash, randomUUID } from "node:crypto";
import { createOpsClient, printJson } from "./db/supabase-ops";

const supabase = createOpsClient();
const runId = randomUUID();
const guestHash = createHash("sha256").update(`guest:${runId}`).digest("hex");
const email = `cart-concurrency-${runId}@example.test`;
const concurrentRequests = 4;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class RemoteRpcError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RemoteRpcError";
  }
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new RemoteRpcError(error.code, `[${name}] ${error.message}`);
  return data as T;
}

async function main() {
  let userId: string | null = null;
  const createdCartIds = new Set<string>();
  const createdOrderIds = new Set<string>();

  try {
    const { data: createdUser, error: createUserError } =
      await supabase.auth.admin.createUser({
        email,
        password: randomUUID(),
        email_confirm: true,
      });
    if (createUserError) throw createUserError;
    userId = createdUser.user.id;

    const productResult = await supabase
      .from("products")
      .select("id,slug,display_name")
      .eq("catalog_status", "active")
      .limit(1)
      .single();
    if (productResult.error) throw productResult.error;

    const variantResult = await supabase
      .from("product_variants")
      .select("product_id,variant_key,label,price_cents")
      .eq("product_id", productResult.data.id)
      .eq("available", true)
      .limit(1)
      .single();
    if (variantResult.error) throw variantResult.error;

    const product = productResult.data;
    const variant = variantResult.data;
    assert(
      product.id === variant.product_id,
      "Representative product and variant must refer to the same product",
    );

    const guestResolutions = await Promise.all(
      Array.from({ length: concurrentRequests }, () =>
        rpc<Array<{ cart_id: string }>>("resolve_active_cart", {
          p_user_id: null,
          p_guest_token_hash: guestHash,
          p_create: true,
        }),
      ),
    );
    const guestCartIds = new Set(guestResolutions.flat().map((row) => row.cart_id));
    assert(guestCartIds.size === 1, "Guest resolution created multiple active carts");
    const guestCartId = [...guestCartIds][0];
    assert(guestCartId, "Guest cart resolution returned no cart");
    createdCartIds.add(guestCartId);

    const userResolutions = await Promise.all(
      Array.from({ length: concurrentRequests }, () =>
        rpc<Array<{ cart_id: string }>>("resolve_active_cart", {
          p_user_id: userId,
          p_guest_token_hash: null,
          p_create: true,
        }),
      ),
    );
    const userCartIds = new Set(userResolutions.flat().map((row) => row.cart_id));
    assert(userCartIds.size === 1, "Authenticated resolution created multiple active carts");
    const userCartId = [...userCartIds][0];
    assert(userCartId, "Authenticated cart resolution returned no cart");
    createdCartIds.add(userCartId);

    const expiredHash = createHash("sha256")
      .update(`expired:${runId}`)
      .digest("hex");
    const { data: expiredCart, error: expiredCartError } = await supabase
      .from("carts")
      .insert({
        guest_token_hash: expiredHash,
        status: "active",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (expiredCartError) throw expiredCartError;
    createdCartIds.add(expiredCart.id);
    const { error: expiredLineError } = await supabase.from("cart_items").insert({
      cart_id: expiredCart.id,
      product_id: product.id,
      variant_key: variant.variant_key,
      quantity: 2,
    });
    if (expiredLineError) throw expiredLineError;

    await rpc("merge_guest_cart", {
      p_user_id: userId,
      p_guest_token_hash: expiredHash,
    });
    const { data: expiredAfterMerge, error: expiredAfterMergeError } =
      await supabase
        .from("carts")
        .select("status")
        .eq("id", expiredCart.id)
        .single();
    if (expiredAfterMergeError) throw expiredAfterMergeError;
    assert(
      expiredAfterMerge.status === "abandoned",
      "Expired source cart was not abandoned during merge",
    );
    const { count: mergedExpiredLineCount, error: mergedExpiredLineError } =
      await supabase
        .from("cart_items")
        .select("id", { count: "exact", head: true })
        .eq("cart_id", userCartId)
        .eq("product_id", product.id)
        .eq("variant_key", variant.variant_key);
    if (mergedExpiredLineError) throw mergedExpiredLineError;
    assert(mergedExpiredLineCount === 0, "Expired guest lines were merged");

    const activeMergeHash = createHash("sha256")
      .update(`active-merge:${runId}`)
      .digest("hex");
    const { data: activeMergeCart, error: activeMergeCartError } = await supabase
      .from("carts")
      .insert({
        guest_token_hash: activeMergeHash,
        status: "active",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (activeMergeCartError) throw activeMergeCartError;
    createdCartIds.add(activeMergeCart.id);
    const { error: activeMergeLineError } = await supabase
      .from("cart_items")
      .insert({
        cart_id: activeMergeCart.id,
        product_id: product.id,
        variant_key: variant.variant_key,
        quantity: 2,
      });
    if (activeMergeLineError) throw activeMergeLineError;

    await Promise.all(
      Array.from({ length: 2 }, () =>
        rpc("merge_guest_cart", {
          p_user_id: userId,
          p_guest_token_hash: activeMergeHash,
        }),
      ),
    );

    const { data: activeMergeSource, error: activeMergeSourceError } =
      await supabase
        .from("carts")
        .select("status")
        .eq("id", activeMergeCart.id)
        .single();
    if (activeMergeSourceError) throw activeMergeSourceError;
    assert(activeMergeSource.status === "merged", "Active guest cart was not merged");

    const concurrentMergeHash = createHash("sha256")
      .update(`concurrent-merge:${runId}`)
      .digest("hex");
    const { data: concurrentMergeCart, error: concurrentMergeCartError } =
      await supabase
        .from("carts")
        .insert({
          guest_token_hash: concurrentMergeHash,
          status: "active",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        })
        .select("id")
        .single();
    if (concurrentMergeCartError) throw concurrentMergeCartError;
    createdCartIds.add(concurrentMergeCart.id);
    const { error: concurrentMergeLineError } = await supabase
      .from("cart_items")
      .insert({
        cart_id: concurrentMergeCart.id,
        product_id: product.id,
        variant_key: variant.variant_key,
        quantity: 3,
      });
    if (concurrentMergeLineError) throw concurrentMergeLineError;

    await Promise.all([
      rpc("merge_guest_cart", {
        p_user_id: userId,
        p_guest_token_hash: concurrentMergeHash,
      }),
      rpc("cart_add_item_delta", {
        p_cart_id: userCartId,
        p_product_id: product.id,
        p_variant_key: variant.variant_key,
        p_quantity_delta: 1,
      }),
    ]);
    await rpc("merge_guest_cart", {
      p_user_id: userId,
      p_guest_token_hash: concurrentMergeHash,
    });

    const { data: mergedUserLine, error: mergedUserLineError } = await supabase
      .from("cart_items")
      .select("quantity")
      .eq("cart_id", userCartId)
      .eq("product_id", product.id)
      .eq("variant_key", variant.variant_key)
      .single();
    if (mergedUserLineError) throw mergedUserLineError;
    assert(
      mergedUserLine.quantity === 6,
      "Concurrent authenticated mutation lost a merged quantity",
    );

    await Promise.all(
      Array.from({ length: concurrentRequests }, () =>
        rpc("cart_add_item_delta", {
          p_cart_id: guestCartId,
          p_product_id: product.id,
          p_variant_key: variant.variant_key,
          p_quantity_delta: 1,
        }),
      ),
    );

    const { data: addedLines, error: addedLinesError } = await supabase
      .from("cart_items")
      .select("id,quantity")
      .eq("cart_id", guestCartId)
      .eq("product_id", product.id)
      .eq("variant_key", variant.variant_key);
    if (addedLinesError) throw addedLinesError;
    assert(addedLines.length === 1, "Concurrent adds created duplicate lines");
    assert(
      addedLines[0]?.quantity === concurrentRequests,
      "Concurrent adds lost an increment",
    );

    const lineId = addedLines[0]?.id;
    assert(lineId, "Added cart line has no id");
    await rpc("cart_set_item_quantity", {
      p_cart_id: guestCartId,
      p_line_id: lineId,
      p_quantity: 7,
    });
    const { data: setLine, error: setLineError } = await supabase
      .from("cart_items")
      .select("quantity")
      .eq("id", lineId)
      .single();
    if (setLineError) throw setLineError;
    assert(setLine.quantity === 7, "Absolute quantity set became additive");

    await rpc("cart_remove_item", { p_cart_id: guestCartId, p_line_id: lineId });
    await rpc("cart_remove_item", { p_cart_id: guestCartId, p_line_id: lineId });

    await rpc("cart_add_item_delta", {
      p_cart_id: guestCartId,
      p_product_id: product.id,
      p_variant_key: variant.variant_key,
      p_quantity_delta: 1,
    });
    const { data: checkoutCart, error: checkoutCartError } = await supabase
      .from("carts")
      .select("checkout_generation")
      .eq("id", guestCartId)
      .single();
    if (checkoutCartError) throw checkoutCartError;

    const idempotencyKey = `checkout:sandbox:${createHash("sha256")
      .update(`checkout:${runId}`)
      .digest("hex")}`;
    const orderArgs = {
      p_idempotency_key: idempotencyKey,
      p_user_id: null,
      p_cart_id: guestCartId,
      p_checkout_generation: checkoutCart.checkout_generation,
      p_customer_email: email,
      p_currency: "USD",
      p_merchandise_subtotal_cents: variant.price_cents,
      p_discount_cents: 0,
      p_shipping_cents: 0,
      p_tax_cents: 0,
      p_total_cents: variant.price_cents,
      p_referral_code: null,
      p_reward_points_redeemed: 0,
      p_reward_discount_cents: 0,
      p_checkout_environment: "sandbox",
      p_metadata: { source: "cart-concurrency-test" },
      p_items: [
        {
          product_id: product.id,
          product_slug: product.slug,
          product_name: product.display_name,
          variant_key: variant.variant_key,
          variant_label: variant.label,
          quantity: 1,
          unit_price_cents: variant.price_cents,
          line_subtotal_cents: variant.price_cents,
          product_snapshot: {
            productId: product.id,
            slug: product.slug,
            variantKey: variant.variant_key,
          },
        },
      ],
    };
    const reservations = await Promise.all(
      Array.from({ length: concurrentRequests }, () =>
        rpc<Array<{ id: string }>>("reserve_checkout_order_snapshot_v2", orderArgs),
      ),
    );
    const orderIds = new Set(reservations.flat().map((row) => row.id));
    assert(orderIds.size === 1, "Concurrent reservations created multiple orders");
    const orderId = [...orderIds][0];
    assert(orderId, "Order reservation returned no order");
    createdOrderIds.add(orderId);

    const { count: itemCount, error: itemCountError } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId);
    if (itemCountError) throw itemCountError;
    assert(itemCount === 1, "Order snapshot contains partial or duplicate items");

    const claimResults = await Promise.allSettled(
      Array.from({ length: concurrentRequests }, () =>
        rpc<string>("claim_checkout_attempt", { p_order_id: orderId }),
      ),
    );
    const acquiredClaims = claimResults.filter(
      (result): result is PromiseFulfilledResult<string> =>
        result.status === "fulfilled",
    );
    const rejectedClaims = claimResults.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    assert(acquiredClaims.length === 1, "Concurrent checkout attempts acquired multiple leases");
    assert(
      rejectedClaims.every(
        (result) =>
          result.reason instanceof RemoteRpcError &&
          result.reason.code === "P0001" &&
          result.reason.message.includes("checkout attempt is already in progress"),
      ),
      "Concurrent checkout attempt rejection used the wrong error contract",
    );
    await rpc("release_checkout_attempt", {
      p_order_id: orderId,
      p_attempt_token: acquiredClaims[0].value,
    });
    const replacementClaim = await rpc<string>("claim_checkout_attempt", {
      p_order_id: orderId,
    });
    const probeSessionId = `cs_test_cart_integrity_${runId}`;
    const preparedAttempt = await rpc<boolean>("prepare_checkout_attempt", {
      p_order_id: orderId,
      p_attempt_token: replacementClaim,
      p_expected_session_id: null,
      p_detach_session: true,
      p_stripe_idempotency_key: `stripe-session:${orderId}:integrity-probe`,
    });
    assert(preparedAttempt, "The active checkout attempt could not be prepared");
    const attachedSession = await rpc<boolean>("attach_checkout_session", {
      p_order_id: orderId,
      p_attempt_token: replacementClaim,
      p_session_id: probeSessionId,
      p_customer_id: null,
      p_stripe_idempotency_key: `stripe-session:${orderId}:integrity-probe`,
    });
    assert(attachedSession, "The active checkout attempt could not attach its session");
    const staleSessionFailureApplied = await rpc<boolean>(
      "fail_checkout_order_from_stripe",
      {
        p_order_id: orderId,
        p_session_id: `${probeSessionId}_stale`,
        p_reason: "stale Stripe session probe",
      },
    );
    assert(
      staleSessionFailureApplied === false,
      "A stale Stripe session changed the shared order",
    );
    const detachedSession = await rpc<boolean>("prepare_checkout_attempt", {
      p_order_id: orderId,
      p_attempt_token: replacementClaim,
      p_expected_session_id: probeSessionId,
      p_detach_session: true,
      p_stripe_idempotency_key: `stripe-session:${orderId}:replacement-probe`,
    });
    assert(detachedSession, "The active checkout attempt could not detach its prior session");
    const staleFailureApplied = await rpc<boolean>("fail_checkout_attempt", {
      p_order_id: orderId,
      p_attempt_token: acquiredClaims[0].value,
      p_reason: "stale concurrency probe",
      p_release_rewards: true,
    });
    assert(
      staleFailureApplied === false,
      "A stale checkout attempt changed the shared order",
    );
    const { data: claimedOrder, error: claimedOrderError } = await supabase
      .from("orders")
      .select("status,checkout_attempt_token,stripe_checkout_session_id")
      .eq("id", orderId)
      .single();
    if (claimedOrderError) throw claimedOrderError;
    assert(
      claimedOrder.status === "pending_payment" &&
        claimedOrder.checkout_attempt_token === replacementClaim &&
        claimedOrder.stripe_checkout_session_id === null,
      "A stale checkout attempt released the active attempt lease",
    );
    await rpc("release_checkout_attempt", {
      p_order_id: orderId,
      p_attempt_token: replacementClaim,
    });

    const siblingOrderArgs = {
      ...orderArgs,
      p_idempotency_key: `checkout:sandbox:${createHash("sha256")
        .update(`sibling-checkout:${runId}`)
        .digest("hex")}`,
    };
    let siblingReservationRejected = false;
    try {
      await rpc("reserve_checkout_order_snapshot_v2", siblingOrderArgs);
    } catch (error) {
      siblingReservationRejected =
        error instanceof RemoteRpcError &&
        error.code === "P0001" &&
        error.message.includes("checkout already reserved for cart generation");
      if (!siblingReservationRejected) throw error;
    }
    assert(
      siblingReservationRejected,
      "A cart generation accepted more than one checkout order",
    );

    const { data: checkoutLine, error: checkoutLineError } = await supabase
      .from("cart_items")
      .select("id")
      .eq("cart_id", guestCartId)
      .eq("product_id", product.id)
      .eq("variant_key", variant.variant_key)
      .single();
    if (checkoutLineError) throw checkoutLineError;
    await rpc("cart_set_item_quantity", {
      p_cart_id: guestCartId,
      p_line_id: checkoutLine.id,
      p_quantity: 2,
    });
    const { data: changedLine, error: changedLineError } = await supabase
      .from("cart_items")
      .select("quantity")
      .eq("id", checkoutLine.id)
      .single();
    if (changedLineError) throw changedLineError;
    assert(changedLine.quantity === 2, "Checkout cart mutation was not persisted");

    const replayRows = await rpc<Array<{ id: string }>>(
      "reserve_checkout_order_snapshot_v2",
      orderArgs,
    );
    assert(
      replayRows[0]?.id === orderId,
      "An idempotent reservation replay did not return the original order",
    );

    const staleOrderArgs = {
      ...orderArgs,
      p_idempotency_key: `checkout:sandbox:${createHash("sha256")
        .update(`stale-checkout:${runId}`)
        .digest("hex")}`,
    };
    let staleSnapshotRejected = false;
    try {
      await rpc("reserve_checkout_order_snapshot_v2", staleOrderArgs);
    } catch (error) {
      staleSnapshotRejected =
        error instanceof RemoteRpcError &&
        error.code === "P0001" &&
        error.message.includes("checkout cart changed");
      if (!staleSnapshotRejected) throw error;
    }
    assert(staleSnapshotRejected, "A stale cart snapshot was accepted");
    await rpc("cart_set_item_quantity", {
      p_cart_id: guestCartId,
      p_line_id: checkoutLine.id,
      p_quantity: 1,
    });

    const { data: freshCart, error: freshCartError } = await supabase
      .from("carts")
      .select("checkout_generation")
      .eq("id", guestCartId)
      .single();
    if (freshCartError) throw freshCartError;
    const freshOrderArgs = {
      ...orderArgs,
      p_idempotency_key: `checkout:sandbox:${createHash("sha256")
        .update(`fresh-checkout:${runId}`)
        .digest("hex")}`,
      p_checkout_generation: freshCart.checkout_generation,
    };
    const freshOrderRows = await rpc<Array<{ id: string }>>(
      "reserve_checkout_order_snapshot_v2",
      freshOrderArgs,
    );
    const freshOrderId = freshOrderRows[0]?.id;
    assert(freshOrderId, "Fresh checkout reservation returned no order");
    createdOrderIds.add(freshOrderId);

    const { error: paidOrderError } = await supabase
      .from("orders")
      .update({ status: "paid" })
      .eq("id", freshOrderId);
    if (paidOrderError) throw paidOrderError;
    await rpc("clear_paid_order_cart", { p_order_id: freshOrderId });
    await rpc("clear_paid_order_cart", { p_order_id: freshOrderId });

    const { data: clearedCart, error: clearedCartError } = await supabase
      .from("carts")
      .select("checkout_generation,cart_items(count)")
      .eq("id", guestCartId)
      .single();
    if (clearedCartError) throw clearedCartError;
    assert(
      clearedCart.checkout_generation !== checkoutCart.checkout_generation,
      "Paid cart clearing did not rotate checkout generation",
    );
    assert(
      clearedCart.cart_items[0]?.count === 0,
      "Paid cart clearing was not idempotent",
    );

    await rpc("cart_add_item_delta", {
      p_cart_id: guestCartId,
      p_product_id: product.id,
      p_variant_key: variant.variant_key,
      p_quantity_delta: 1,
    });
    const { data: repeatCart, error: repeatCartError } = await supabase
      .from("carts")
      .select("checkout_generation,cart_items(count)")
      .eq("id", guestCartId)
      .single();
    if (repeatCartError) throw repeatCartError;

    const { error: latePaidOrderError } = await supabase
      .from("orders")
      .update({ status: "paid" })
      .eq("id", orderId);
    if (latePaidOrderError) throw latePaidOrderError;
    await rpc("clear_paid_order_cart", { p_order_id: orderId });
    await rpc("clear_paid_order_cart", { p_order_id: orderId });

    const { data: preservedCart, error: preservedCartError } = await supabase
      .from("carts")
      .select("checkout_generation,cart_items(count)")
      .eq("id", guestCartId)
      .single();
    if (preservedCartError) throw preservedCartError;
    assert(
      preservedCart.checkout_generation === repeatCart.checkout_generation,
      "Late payment rotated a newer cart generation",
    );
    assert(
      preservedCart.cart_items[0]?.count === 1,
      "Late payment removed items from a newer cart generation",
    );

    const repeatOrderKey = `checkout:sandbox:${createHash("sha256")
      .update(`repeat-checkout:${runId}`)
      .digest("hex")}`;
    const repeatOrderRows = await rpc<Array<{ id: string }>>(
      "reserve_checkout_order_snapshot_v2",
      {
        ...orderArgs,
        p_idempotency_key: repeatOrderKey,
        p_checkout_generation: preservedCart.checkout_generation,
      },
    );
    const repeatOrderId = repeatOrderRows[0]?.id;
    assert(repeatOrderId, "Repeat checkout reservation returned no order");
    assert(repeatOrderId !== orderId, "An identical repeat purchase reused a paid order");
    createdOrderIds.add(repeatOrderId);

    const cancellationClaim = await rpc<string>("claim_checkout_attempt", {
      p_order_id: repeatOrderId,
    });
    const noSessionCancellationApplied = await rpc<boolean>(
      "cancel_checkout_order_without_session",
      {
        p_order_id: repeatOrderId,
        p_reason: "no-session cancellation concurrency probe",
      },
    );
    assert(noSessionCancellationApplied, "No-session cancellation did not apply atomically");
    const attachAfterCancellation = await rpc<boolean>("attach_checkout_session", {
      p_order_id: repeatOrderId,
      p_attempt_token: cancellationClaim,
      p_session_id: `cs_test_cancelled_${runId}`,
      p_customer_id: null,
      p_stripe_idempotency_key: `stripe-session:${repeatOrderId}:cancelled-probe`,
    });
    assert(
      attachAfterCancellation === false,
      "A cancelled no-session checkout accepted a late Stripe session",
    );

    const { data: postCancellationCart, error: postCancellationCartError } =
      await supabase
        .from("carts")
        .select("checkout_generation")
        .eq("id", guestCartId)
        .single();
    if (postCancellationCartError) throw postCancellationCartError;
    assert(
      postCancellationCart.checkout_generation !== preservedCart.checkout_generation,
      "No-session cancellation did not retire the checkout generation",
    );

    const paidCasOrderRows = await rpc<Array<{ id: string }>>(
      "reserve_checkout_order_snapshot_v2",
      {
        ...orderArgs,
        p_idempotency_key: `checkout:sandbox:${createHash("sha256")
          .update(`paid-cas-checkout:${runId}`)
          .digest("hex")}`,
        p_checkout_generation: postCancellationCart.checkout_generation,
      },
    );
    const paidCasOrderId = paidCasOrderRows[0]?.id;
    assert(paidCasOrderId, "Paid-CAS checkout reservation returned no order");
    createdOrderIds.add(paidCasOrderId);

    const paidCasClaim = await rpc<string>("claim_checkout_attempt", {
      p_order_id: paidCasOrderId,
    });
    const firstPaidSession = `cs_test_paid_stale_${runId}`;
    const currentPaidSession = `cs_test_paid_current_${runId}`;
    await rpc("prepare_checkout_attempt", {
      p_order_id: paidCasOrderId,
      p_attempt_token: paidCasClaim,
      p_expected_session_id: null,
      p_detach_session: true,
      p_stripe_idempotency_key: `stripe-session:${paidCasOrderId}:initial`,
    });
    await rpc("attach_checkout_session", {
      p_order_id: paidCasOrderId,
      p_attempt_token: paidCasClaim,
      p_session_id: firstPaidSession,
      p_customer_id: null,
      p_stripe_idempotency_key: `stripe-session:${paidCasOrderId}:initial`,
    });
    await rpc("prepare_checkout_attempt", {
      p_order_id: paidCasOrderId,
      p_attempt_token: paidCasClaim,
      p_expected_session_id: firstPaidSession,
      p_detach_session: true,
      p_stripe_idempotency_key: `stripe-session:${paidCasOrderId}:replacement`,
    });
    await rpc("attach_checkout_session", {
      p_order_id: paidCasOrderId,
      p_attempt_token: paidCasClaim,
      p_session_id: currentPaidSession,
      p_customer_id: null,
      p_stripe_idempotency_key: `stripe-session:${paidCasOrderId}:replacement`,
    });

    const paidFinalizationArgs = {
      p_order_id: paidCasOrderId,
      p_customer_email: email,
      p_discount_cents: 0,
      p_shipping_cents: 0,
      p_tax_cents: 0,
      p_total_cents: variant.price_cents,
      p_payment_intent_id: `pi_test_cart_integrity_${runId}`,
      p_customer_id: null,
      p_reward_points_earned: 0,
      p_shipping_name: "Cart Integrity",
      p_shipping_address: {},
      p_billing_address: {},
      p_payment_method_type: "card",
      p_payment_raw_status: "paid",
    };
    const stalePaidRows = await rpc<Array<{ id: string }>>(
      "finalize_paid_checkout_order",
      {
        ...paidFinalizationArgs,
        p_session_id: firstPaidSession,
      },
    );
    assert(stalePaidRows.length === 0, "A detached Stripe session finalized the order");
    const paidRows = await rpc<Array<{ id: string; status: string }>>(
      "finalize_paid_checkout_order",
      {
        ...paidFinalizationArgs,
        p_session_id: currentPaidSession,
      },
    );
    assert(
      paidRows[0]?.id === paidCasOrderId && paidRows[0]?.status === "paid",
      "The current Stripe session did not finalize the order",
    );

    printJson({
      status: "passed",
      guestActiveCartCount: guestCartIds.size,
      authenticatedActiveCartCount: userCartIds.size,
      concurrentAddQuantity: concurrentRequests,
      reservedOrderCount: orderIds.size,
      expiredMergeLineCount: mergedExpiredLineCount,
      activeMergedQuantity: mergedUserLine.quantity,
      checkoutAttemptLeaseCount: acquiredClaims.length,
      staleStripeSessionRejected: staleSessionFailureApplied === false,
      noSessionCancellationWon: noSessionCancellationApplied,
      stalePaidSessionRejected: stalePaidRows.length === 0,
      siblingReservationRejected,
      staleSnapshotRejected,
      repeatPurchaseOrderCount: 4,
    });
  } finally {
    if (createdOrderIds.size > 0) {
      await supabase.from("orders").delete().in("id", [...createdOrderIds]);
    }
    if (createdCartIds.size > 0) {
      await supabase.from("carts").delete().in("id", [...createdCartIds]);
    }
    if (userId) await supabase.auth.admin.deleteUser(userId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
