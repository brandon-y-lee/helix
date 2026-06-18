"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mergeGuestCartIntoCurrentUser } from "@/lib/cart/server";
import { safeReturnTo } from "@/lib/auth/redirect";
import {
  normalizeProfileName,
  readString,
  validateEmail,
  validatePassword,
  type AuthActionState,
} from "@/lib/auth/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function originFromHeaders(headersList: Headers): string {
  return (
    headersList.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_URL?.replace(/^/, "https://") ??
    "http://localhost:3000"
  );
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
    return {
      status: "error",
      message: "Email or password did not match. Check your details and try again.",
    };
  }

  await mergeGuestCartIntoCurrentUser();
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
    return {
      status: "error",
      message: "We could not create the account. Check the details and try again.",
    };
  }

  if (data.session) {
    await mergeGuestCartIntoCurrentUser();
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
  await supabase.auth.resetPasswordForEmail(email, { redirectTo });

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
  } = await supabase.auth.getUser();
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
  } = await supabase.auth.getUser();
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
  redirect("/account/sign-in");
}
