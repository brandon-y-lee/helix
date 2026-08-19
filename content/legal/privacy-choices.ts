import type { LegalDocument } from "./types";
import { supportPolicy } from "@/content/support/policy";

export const privacyChoices: LegalDocument = {
  title: "Your Privacy Choices",
  metadataTitle: "Your Privacy Choices | helix",
  description: "Current Privacy Choice behavior on the helix Public Site.",
  canonical: "/privacy-choices",
  status: "Updated August 19, 2026",
  intro:
    "The current site does not include advertising pixels, cross-context behavioral advertising, or a sale/share opt-out workflow. This page explains the current status and links to related controls.",
  sections: [
    {
      id: "current-status",
      title: "Current Status",
      body: [
        "The site does not include advertising tags, behavioral advertising scripts, or a data-sale workflow. Because those categories are not active, this page does not show an inactive opt-out switch.",
      ],
    },
    {
      id: "available-controls",
      title: "Available Controls",
      body: [
        "The Cookie notice records only that the required and functional storage disclosure was shown and acknowledged. It is not a Cookie Preference or optional-storage choice.",
        "Account holders can access and update profile information through the Account page.",
        "Cart contents can be edited or cleared through the cart interface.",
      ],
    },
    {
      id: "requests",
      title: "Privacy Requests",
      body: [
        `Use the Contact page to prepare access, correction, deletion, or Privacy Request details. ${supportPolicy.contactStatus} The page cannot submit or store a Privacy Request.`,
      ],
    },
    {
      id: "future",
      title: "Future Advertising or Analytics",
      body: [
        "If the helix Platform later adds optional analytics, advertising, or other privacy-choice technology, this page and a genuine Cookie Preference control must be updated before those tools are enabled.",
      ],
    },
  ],
};
