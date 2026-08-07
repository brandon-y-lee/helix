import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomePhasedDescription } from "@/components/home/HomePhasedDescription";

describe("HomePhasedDescription", () => {
  it("announces the current copy while rendering a character sequence", async () => {
    const initialText = "Simple by design. For all skin types.";
    const nextText = "Start with a gentle cleanse.";
    const view = render(<HomePhasedDescription text={initialText} />);

    const liveRegion = view.container.querySelector(
      ".home-phased-description",
    );
    expect(liveRegion).toHaveTextContent(initialText);
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion).toHaveAttribute("aria-atomic", "true");

    view.rerender(<HomePhasedDescription text={nextText} />);

    await waitFor(() =>
      expect(
        liveRegion?.querySelector(".home-phased-description__text"),
      ).toHaveTextContent(nextText),
    );
    expect(
      liveRegion?.querySelectorAll(".home-phased-description__character"),
    ).toHaveLength(nextText.length);
  });
});
