import "server-only";

export type TrustpilotInvitationInput = {
  orderNumber: string;
  customerEmail: string;
  customerName?: string | null;
};

export type TrustpilotInvitationResult = {
  status: "blocked_private_feedback_only" | "not_configured";
  provider: "trustpilot";
  sent: false;
  reason: string;
};

export function trustpilotConfigured(): boolean {
  return Boolean(
    process.env.TRUSTPILOT_API_KEY &&
      process.env.TRUSTPILOT_API_SECRET &&
      process.env.TRUSTPILOT_BUSINESS_UNIT_ID &&
      process.env.TRUSTPILOT_INVITATION_TEMPLATE_ID,
  );
}

export async function createNeutralTrustpilotInvitation(
  input: TrustpilotInvitationInput,
): Promise<TrustpilotInvitationResult> {
  void input;
  if (!trustpilotConfigured()) {
    return {
      status: "not_configured",
      provider: "trustpilot",
      sent: false,
      reason: "Trustpilot business credentials are not configured.",
    };
  }

  return {
    status: "blocked_private_feedback_only",
    provider: "trustpilot",
    sent: false,
    reason:
      "Sandbox orders never send real Trustpilot invitations, and rewards are never conditioned on Trustpilot activity.",
  };
}
