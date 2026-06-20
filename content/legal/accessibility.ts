import type { LegalDocument } from "./types";

export const accessibilityStatement: LegalDocument = {
  title: "Accessibility Statement",
  metadataTitle: "Accessibility Statement | Mei-Pelle",
  description:
    "Mei-Pelle's current accessibility target and feedback path for the development storefront.",
  canonical: "/accessibility",
  status: "Development statement - current as of June 20, 2026",
  intro:
    "Mei-Pelle is built with accessibility as an engineering requirement. The current target is WCAG 2.2 AA for implemented storefront, account, cart, search, footer, support, and legal flows.",
  sections: [
    {
      id: "target",
      title: "Current Target",
      body: [
        "The current design and engineering target is WCAG 2.2 AA. This is a target for active development, not a formal certification.",
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
        "Accessible mobile navigation and footer accordions.",
        "Focus-visible treatment for links, controls, and dialogs.",
        "Reduced-motion support for animation-heavy states.",
      ],
    },
    {
      id: "testing",
      title: "Testing and Improvement",
      body: [
        "Accessibility checks are included in component and Playwright coverage for the implemented flows. Manual keyboard and responsive review should continue before launch.",
      ],
    },
    {
      id: "feedback",
      title: "Feedback",
      body: [
        "Use the Contact page and choose Accessibility feedback to prepare feedback details. The development site does not transmit messages until support transport is configured.",
      ],
    },
    {
      id: "limitations",
      title: "Known Limitations",
      body: [
        "No third-party accessibility audit, formal conformance report, or accessibility vendor certification has been completed in this repository.",
      ],
    },
  ],
};
