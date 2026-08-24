import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  SystemCoreFlow,
  type SystemCoreFlowItem,
} from "@/components/system/SystemCoreFlow";

const coreItems: SystemCoreFlowItem[] = [
  {
    anchorId: "system-cleanse",
    displayName: "Biotic Reset",
    displayNumber: "01",
    legacyAnchorIds: ["step-cleanse", "step-reset", "method-cleanse", "method-reset"],
    narrative: "A cleanser narrative.",
    productType: "Daily gel cleanser",
    slug: "biotic-reset",
    stepName: "CLEANSE",
    swatch: ["#dce8df", "#7e9285"],
  },
  {
    anchorId: "system-treat",
    displayName: "Peptide Bounce",
    displayNumber: "02",
    legacyAnchorIds: ["step-treat", "step-recode", "method-treat", "method-recode"],
    narrative: "A treatment narrative.",
    productType: "PDRN serum",
    slug: "peptide-bounce",
    stepName: "TREAT",
    swatch: ["#eadfd9", "#9e7f76"],
  },
  {
    anchorId: "system-seal",
    displayName: "Ceramide Cushion",
    displayNumber: "03",
    legacyAnchorIds: ["step-seal", "method-seal"],
    narrative: "A moisturizer narrative.",
    productType: "Intensive moisture cream",
    slug: "ceramide-cushion",
    stepName: "SEAL",
    swatch: ["#e4dfd1", "#8e876f"],
  },
];

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("SystemCoreFlow", () => {
  it("presents the fixed Core sequence with catalog-backed active copy", () => {
    const { container } = render(<SystemCoreFlow items={coreItems} />);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Three steps form the baseline.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("The Core")).toBeInTheDocument();
    expect(container.querySelector('[data-helix-identity="symbol"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "CLEANSEBiotic ResetDaily gel cleanser",
      "TREATPeptide BouncePDRN serum",
      "SEALCeramide CushionIntensive moisture cream",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(document.getElementById("system-core-panel-treat")).toHaveAttribute(
      "inert",
    );

    const activePanel = screen.getByRole("tabpanel", { name: /CLEANSE/i });
    expect(activePanel).toHaveClass("method-selection-panel");
    expect(activePanel.querySelector(".method-flow__position")).not.toBeInTheDocument();
    expect(
      within(activePanel).getByRole("heading", { level: 3, name: "Biotic Reset" }),
    ).toBeInTheDocument();
    expect(activePanel).toHaveTextContent("Daily gel cleanser");
    expect(activePanel).toHaveTextContent("A cleanser narrative.");
    expect(
      within(activePanel).getByRole("link", { name: "View Biotic Reset" }),
    ).toHaveAttribute("href", "/products/biotic-reset");
  });

  it("changes the active step through tabs and wrapping sequence controls", async () => {
    const user = userEvent.setup();
    const { container } = render(<SystemCoreFlow items={coreItems} />);
    const tabs = screen.getAllByRole("tab");

    await user.click(tabs[1]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tabpanel", { name: /TREAT/i }),
    ).toHaveTextContent("Peptide Bounce");
    expect(container.querySelector(".method-flow")).toHaveAttribute(
      "data-active-step",
      "treat",
    );

    const previous = screen.getByRole("button", { name: "Previous Core step" });
    const next = screen.getByRole("button", { name: "Next Core step" });
    await user.click(previous);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    await user.click(previous);
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Core step 3 of 3: SEAL/)).toHaveAttribute(
      "aria-live",
      "polite",
    );
    await user.click(next);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("supports wrapping arrow, Home, and End navigation in the tab list", async () => {
    const user = userEvent.setup();
    render(<SystemCoreFlow items={coreItems} />);
    const tabs = screen.getAllByRole("tab");

    tabs[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{End}");
    expect(tabs[2]).toHaveFocus();
    await user.keyboard("{Home}");
    expect(tabs[0]).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(tabs[2]).toHaveFocus();
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
  });

  it("selects the Core step named by a canonical inbound hash", () => {
    window.history.replaceState(null, "", "/system#system-treat");
    render(<SystemCoreFlow items={coreItems} />);

    expect(screen.getAllByRole("tab")[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel", { name: /TREAT/i })).toHaveTextContent(
      "Peptide Bounce",
    );
  });

  it("selects the Core step named by a legacy inbound hash", () => {
    window.history.replaceState(null, "", "/system#step-recode");
    render(<SystemCoreFlow items={coreItems} />);

    expect(screen.getAllByRole("tab")[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel", { name: /TREAT/i })).toHaveTextContent(
      "Peptide Bounce",
    );
  });

  it("keeps a missing Core step in sequence without inventing a product link", async () => {
    const user = userEvent.setup();
    const missingItems: SystemCoreFlowItem[] = coreItems.map((item) =>
      item.stepName === "TREAT"
        ? {
            ...item,
            narrative:
              "No collection-facing Core entry is available for this step.",
            displayName: "TREAT currently unavailable",
            productType: "Currently unavailable",
            slug: null,
            swatch: ["#dedbd3", "#807d76"],
          }
        : item,
    );

    render(<SystemCoreFlow items={missingItems} />);
    await user.click(screen.getAllByRole("tab")[1]);

    const panel = screen.getByRole("tabpanel", { name: /TREAT/i });
    expect(
      within(panel).getByRole("heading", {
        name: "TREAT currently unavailable",
      }),
    ).toBeInTheDocument();
    expect(panel).toHaveTextContent(
      "No collection-facing Core entry is available for this step.",
    );
    expect(within(panel).queryByRole("link")).not.toBeInTheDocument();
  });
});
