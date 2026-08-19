import type { LegalDocument } from "./types";
import { supportPolicy } from "@/content/support/policy";

export const accessibilityStatement: LegalDocument = {
  title: "Accessibility Statement",
  metadataTitle: "Accessibility Statement | helix",
  description:
    "The helix Accessibility Commitment, implemented practices, known limitations, and feedback status.",
  canonical: "/accessibility",
  status: "Updated August 19, 2026",
  intro:
    "The helix Accessibility Commitment is to provide a usable Public Site experience for Visitors using keyboard, screen-reader, magnification, touch, and pointer input.",
  sections: [
    {
      id: "target",
      title: "Target",
      body: [
        "The design and engineering target is WCAG 2.2 AA for implemented Storefront, Account, Cart, search, footer, support, and policy flows. This is a target, not a formal certification or conformance report.",
      ],
    },
    {
      id: "features",
      title: "Implemented Practices",
      body: [
        "The site uses semantic landmarks, visible focus states, keyboard-accessible navigation, labeled forms, accessible dialogs and drawers, reduced-motion handling, and server-rendered content where practical.",
      ],
      list: [
        "Skip link to main content.",
        "Keyboard-operable search and cart drawers.",
        "Native FAQ disclosure controls.",
        "Accessible mobile navigation and footer accordions.",
        "Focus-visible treatment for links, controls, and dialogs.",
        "Reduced-motion support for animation-heavy states.",
      ],
    },
    {
      id: "testing",
      title: "Testing and Improvement",
      body: [
        "Accessibility checks are included in component and Playwright coverage for implemented flows. Manual keyboard, screen-reader, responsive, and reduced-motion review should continue before major releases.",
      ],
    },
    {
      id: "feedback",
      title: "Feedback",
      body: [
        "Use the Contact page and choose Accessibility feedback to prepare page, device, browser, assistive technology, and task details.",
        `${supportPolicy.contactStatus} The Contact page therefore cannot submit or store Accessibility Feedback.`,
      ],
    },
    {
      id: "limitations",
      title: "Known Limitations",
      body: [
        "No third-party accessibility audit, formal conformance report, or accessibility vendor certification has been completed in this repository.",
        "Some provider-controlled experiences may have separate accessibility behavior outside the helix Platform's direct implementation.",
      ],
    },
  ],
};
