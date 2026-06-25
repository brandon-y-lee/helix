import type { LegalDocument } from "./types";

export const privacyChoices: LegalDocument = {
  title: "Your Privacy Choices",
  metadataTitle: "Your Privacy Choices | Mei Pelle",
  description: "Current privacy-choice behavior for the Mei Pelle website.",
  canonical: "/privacy-choices",
  status: "Last updated June 24, 2026",
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
        "Cookie Preferences lets users acknowledge the current essential-cookie-only setup.",
        "Account holders can access and update profile information through the Account page.",
        "Cart contents can be edited or cleared through the cart interface.",
      ],
    },
    {
      id: "requests",
      title: "Privacy Requests",
      body: [
        "Use the Contact page to prepare access, correction, deletion, or privacy-choice request details while Mei Pelle finalizes a verified public privacy intake channel.",
      ],
    },
    {
      id: "future",
      title: "Future Advertising or Analytics",
      body: [
        "If Mei Pelle later adds optional analytics, advertising, or other privacy-choice technology, this page and the Cookie Preferences control should be updated before those tools are enabled.",
      ],
    },
  ],
};
