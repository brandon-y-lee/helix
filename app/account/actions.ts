"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mergeGuestCartIntoCurrentUser } from "@/lib/cart/server";
import { markCartIdentityChanged } from "@/lib/cart/auth-sync";
import { signUpErrorMessage } from "@/lib/auth/errors";
import { safeReturnTo } from "@/lib/auth/redirect";
import {
  normalizeProfileName,
  readString,
  validateEmail,
  validatePassword,
  type AuthActionState,
} from "@/lib/auth/validation";
import {
  isSupabaseNetworkError,
  logSupabaseUnavailable,
} from "@/lib/supabase/network";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePublicSiteOrigin } from "@/lib/site-url";

function originFromHeaders(headersList: Headers): string {
  return resolvePublicSiteOrigin({ requestOrigin: headersList.get("origin") });
}

async function unavailableAuthState(
  error: unknown,
  operation: string,
): Promise<AuthActionState | null> {
  if (!isSupabaseNetworkError(error)) return null;
  const headersList = await headers();
  logSupabaseUnavailable(error, {
    operation,
    route: headersList.get("next-url") ?? "/account",
    runtime: "nodejs",
    requestId: headersList.get("x-request-id"),
  });
  return {
    status: "error",
    message: "Account services are temporarily unavailable. Try again.",
  };
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readString(formData, "email");
  const password = readString(formData, "password");
  const next = safeReturnTo(formData.get("next"));

  const fieldErrors: Record<string, string> = {};
  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);
  if (emailError) fieldErrors.email = emailError;
  if (passwordError) fieldErrors.password = passwordError;
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors, message: "Check the highlighted fields." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const unavailable = await unavailableAuthState(
      error,
      "auth.signInWithPassword",
    );
    if (unavailable) return unavailable;
    return {
      status: "error",
      message: "Email or password did not match. Check your details and try again.",
    };
  }

  await mergeGuestCartIntoCurrentUser();
  await markCartIdentityChanged();
  redirect(next);
}

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readString(formData, "email");
  const password = readString(formData, "password");
  const firstName = normalizeProfileName(readString(formData, "firstName"));
  const lastName = normalizeProfileName(readString(formData, "lastName"));

  const fieldErrors: Record<string, string> = {};
  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);
  if (emailError) fieldErrors.email = emailError;
  if (passwordError) fieldErrors.password = passwordError;
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors, message: "Check the highlighted fields." };
  }

  const headersList = await headers();
  const emailRedirectTo = `${originFromHeaders(headersList)}/auth/callback?next=${encodeURIComponent("/account")}`;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: { first_name: firstName, last_name: lastName },
    },
  });

  if (error) {
    const unavailable = await unavailableAuthState(error, "auth.signUp");
    if (unavailable) return unavailable;
    return {
      status: "error",
      message: signUpErrorMessage(error),
    };
  }

  if (data.session) {
    await mergeGuestCartIntoCurrentUser();
    await markCartIdentityChanged();
    redirect("/account");
  }

  return {
    status: "success",
    message: "Check your email to verify the account, then return to sign in.",
  };
}

export async function forgotPasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readString(formData, "email");
  const fieldErrors: Record<string, string> = {};
  const emailError = validateEmail(email);
  if (emailError) fieldErrors.email = emailError;
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors, message: "Check the highlighted fields." };
  }

  const headersList = await headers();
  const redirectTo = `${originFromHeaders(headersList)}/auth/callback?next=${encodeURIComponent("/account/reset-password")}`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) {
    const unavailable = await unavailableAuthState(
      error,
      "auth.resetPasswordForEmail",
    );
    if (unavailable) return unavailable;
  }

  return {
    status: "success",
    message: "If an account exists for that email, password reset instructions will arrive shortly.",
  };
}

export async function updatePasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirmPassword");
  const fieldErrors: Record<string, string> = {};
  const passwordError = validatePassword(password);
  if (passwordError) fieldErrors.password = passwordError;
  if (password !== confirmPassword) fieldErrors.confirmPassword = "Passwords must match.";
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors, message: "Check the highlighted fields." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    const unavailable = await unavailableAuthState(
      userError,
      "auth.getUser.updatePassword",
    );
    if (unavailable) return unavailable;
  }
  if (!user) {
    return { status: "error", message: "This reset link is expired or invalid." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { status: "error", message: "Password could not be updated. Request a new reset link." };
  }

  return { status: "success", message: "Password updated." };
}

export async function updateProfileAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const firstName = normalizeProfileName(readString(formData, "firstName"));
  const lastName = normalizeProfileName(readString(formData, "lastName"));

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    const unavailable = await unavailableAuthState(
      userError,
      "auth.getUser.updateProfile",
    );
    if (unavailable) return unavailable;
  }
  if (!user) {
    redirect("/account/sign-in?next=%2Faccount");
  }

  const { error } = await supabase
    .from("profiles")
    .upsert({
      user_id: user.id,
      first_name: firstName || null,
      last_name: lastName || null,
    })
    .eq("user_id", user.id);

  if (error) {
    return { status: "error", message: "Profile could not be updated." };
  }

  revalidatePath("/account");
  return { status: "success", message: "Profile updated." };
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  await markCartIdentityChanged();
  redirect("/account/sign-in");
}
