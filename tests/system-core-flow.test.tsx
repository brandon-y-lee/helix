import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  SystemCoreFlow,
  type SystemCoreFlowItem,
} from "@/components/system/SystemCoreFlow";

const coreItems: SystemCoreFlowItem[] = [
  {
    anchorId: "system-cleanse",
    backgroundMedia: null,
    displayName: "Biotic Reset",
    displayNumber: "01",
    heroLines: ["Wash off the day.", "Start fresh."],
    productType: "Daily gel cleanser",
    slug: "biotic-reset",
    stepName: "CLEANSE",
    swatch: ["#dce8df", "#7e9285"],
  },
  {
    anchorId: "system-treat",
    backgroundMedia: null,
    displayName: "Super Serum",
    displayNumber: "02",
    heroLines: ["Bring skin back.", "Smooth. Hydrated."],
    productType: "PDRN serum",
    slug: "super-serum",
    stepName: "TREAT",
    swatch: ["#eadfd9", "#9e7f76"],
  },
  {
    anchorId: "system-seal",
    backgroundMedia: null,
    displayName: "Ceramide Cushion",
    displayNumber: "03",
    heroLines: ["Hold every layer.", "Keep moisture in."],
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
        name: "The Core",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("The essential baseline")).not.toBeInTheDocument();
    expect(container.querySelector('[data-helix-identity="symbol"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "CLEANSEBiotic ResetDaily gel cleanser",
      "TREATSuper SerumPDRN serum",
      "SEALCeramide CushionIntensive moisture cream",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    const tablist = screen.getByRole("tablist", { name: "Core system steps" });
    const heading = screen.getByRole("heading", {
      level: 2,
      name: "The Core",
    });
    const activePanel = screen.getByRole("tabpanel", { name: /CLEANSE/i });
    expect(
      heading.compareDocumentPosition(activePanel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      activePanel.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(document.getElementById("system-core-panel-treat")).toHaveAttribute(
      "inert",
    );

    expect(activePanel).toHaveClass("system-selection-panel");
    expect(activePanel.querySelector(".system-flow__position")).not.toBeInTheDocument();
    expect(activePanel).toHaveTextContent("Wash off the day.");
    expect(activePanel).toHaveTextContent("Start fresh.");
    expect(activePanel.querySelectorAll(".system-flow__hero-phrase > span")).toHaveLength(2);
    const productLink = within(activePanel).getByRole("link", {
      name: "View Biotic Reset",
    });
    expect(productLink).toHaveAttribute("href", "/products/biotic-reset");
    expect(productLink).toHaveClass("btn", "system-flow__product-link");
  });

  it("changes the active step through tabs and wrapping sequence controls", async () => {
    const user = userEvent.setup();
    const { container } = render(<SystemCoreFlow items={coreItems} />);
    const tabs = screen.getAllByRole("tab");

    await user.click(tabs[1]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tabpanel", { name: /TREAT/i }),
    ).toHaveTextContent("Super Serum");
    expect(container.querySelector(".system-flow")).toHaveAttribute(
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

  it.each([
    ["system-cleanse", 0, "CLEANSE"],
    ["system-treat", 1, "TREAT"],
    ["system-seal", 2, "SEAL"],
  ])("selects the Core step named by the inbound #%s hash", (hash, index, step) => {
    window.history.replaceState(null, "", `/system#${hash}`);
    render(<SystemCoreFlow items={coreItems} />);

    expect(screen.getAllByRole("tab")[index]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: new RegExp(step) })).toBeVisible();
    expect(document.querySelectorAll(`[id="${hash}"]`)).toHaveLength(1);
  });

  it("selects changed canonical hashes without moving keyboard focus", () => {
    render(<SystemCoreFlow items={coreItems} />);
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    for (const [hash, index] of [["system-treat", 1], ["system-seal", 2], ["system-cleanse", 0]] as const) {
      window.history.replaceState(null, "", `/system#${hash}`);
      fireEvent(window, new HashChangeEvent("hashchange"));
      expect(tabs[index]).toHaveAttribute("aria-selected", "true");
      expect(tabs[0]).toHaveFocus();
    }
  });

  it("ignores retired inbound and changed hashes without changing the selected step", () => {
    window.history.replaceState(null, "", "/system#step-recode");
    render(<SystemCoreFlow items={coreItems} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.click(tabs[2]);

    for (const hash of ["method-treat", "step-reset", "system-routine", "method-routine"]) {
      window.history.replaceState(null, "", `/system#${hash}`);
      fireEvent(window, new HashChangeEvent("hashchange"));
      expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    }
  });

  it("keeps a missing Core step in sequence without inventing a product link", async () => {
    const user = userEvent.setup();
    const missingItems: SystemCoreFlowItem[] = coreItems.map((item) =>
      item.stepName === "TREAT"
        ? {
            ...item,
            heroLines: [
              "Step unavailable.",
              "No product is listed.",
            ] as const,
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
    expect(panel).toHaveTextContent("Step unavailable.");
    expect(panel).toHaveTextContent("No product is listed.");
    expect(within(panel).queryByRole("link")).not.toBeInTheDocument();
  });
});
