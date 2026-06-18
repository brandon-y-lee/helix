type SupabaseAuthErrorLike = {
  code?: string;
  message?: string;
  status?: number;
};

export function signUpErrorMessage(error: SupabaseAuthErrorLike): string {
  const code = error.code?.toLowerCase() ?? "";
  const message = error.message?.toLowerCase() ?? "";

  if (
    error.status === 429 ||
    code === "over_email_send_rate_limit" ||
    message.includes("email rate limit")
  ) {
    return "Account email is temporarily rate-limited. Wait a little while before trying again.";
  }

  if (code.includes("weak_password") || message.includes("weak password")) {
    return "Use a stronger password and try again.";
  }

  if (code.includes("email") && message.includes("invalid")) {
    return "Enter a valid email address.";
  }

  return "We could not create the account. Check the details and try again.";
}
