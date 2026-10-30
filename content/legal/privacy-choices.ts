import type { LegalDocument } from "./types";

export const privacyChoices: LegalDocument = {
  title: "Your Privacy Choices",
  metadataTitle: "Your Privacy Choices | helix",
  description:
    "Review required storage and your privacy choices on the Helix website.",
  canonical: "/privacy-choices",
  status: "Last updated October 28, 2026",
  intro:
    "Helix Labs LLC DBA Helix uses required cookies to support account access, shopping and security. You can choose whether to allow optional analytics and marketing technologies in this browser.",
  sections: [
    {
      id: "available-controls",
      title: "Review your choices",
      body: [
        "Open Your Privacy Choices on this page or from the footer at any time. The dialog explains required storage and search, and lets you allow or turn off optional analytics and marketing. Confirm my choices saves your selection for 180 days in this browser. Closing without confirming discards changes. Global Privacy Control keeps marketing off while your browser sends that signal. You can also block or delete cookies through your browser settings, although some website features may stop working.",
      ],
    },
    {
      id: "requests",
      title: "Privacy requests",
      body: [
        "For questions about your personal information or to exercise your privacy rights, contact support@helixskin.com. Read our Privacy Policy for further information.",
      ],
    },
  ],
};
