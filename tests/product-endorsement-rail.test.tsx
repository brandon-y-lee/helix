import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductEndorsementRail } from "@/components/ProductEndorsementRail";
import {
  productEndorsementMedia,
  validFamiliarFaceMedia,
  type FamiliarFaceMedia,
} from "@/lib/content/product-endorsements";

const familiarFaceItems = [
  {
    id: "portrait-one",
    src: "/media/campaign/portrait-one.webp",
    alt: "Editorial portrait in soft studio light.",
    width: 800,
    height: 1000,
    focalPosition: "50% 40%",
  },
  {
    id: "portrait-two",
    src: "/media/campaign/portrait-two.webp",
    alt: "Editorial skincare portrait against a neutral background.",
    width: 800,
    height: 1000,
  },
  {
    id: "portrait-three",
    src: "/media/campaign/portrait-three.webp",
    alt: "Close editorial portrait with natural skin texture.",
    width: 800,
    height: 1000,
  },
] as const satisfies readonly FamiliarFaceMedia[];

let clientWidthSpy: ReturnType<typeof vi.spyOn>;
let scrollWidthSpy: ReturnType<typeof vi.spyOn>;
let originalScrollBy: typeof HTMLElement.prototype.scrollBy;

beforeEach(() => {
  clientWidthSpy = vi
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockReturnValue(300);
  scrollWidthSpy = vi
    .spyOn(HTMLElement.prototype, "scrollWidth", "get")
    .mockReturnValue(900);
  originalScrollBy = HTMLElement.prototype.scrollBy;
  HTMLElement.prototype.scrollBy = function scrollBy(
    options?: ScrollToOptions | number,
    y?: number,
  ) {
    const requestedLeft =
      typeof options === "number" ? options : (options?.left ?? 0);
    this.scrollLeft = Math.min(600, Math.max(0, this.scrollLeft + requestedLeft));
    this.dispatchEvent(new Event("scroll"));
    void y;
  };
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
});

afterEach(() => {
  clientWidthSpy.mockRestore();
  scrollWidthSpy.mockRestore();
  HTMLElement.prototype.scrollBy = originalScrollBy;
});

describe("product endorsement rail", () => {
  it("renders no empty section when there is no valid local media", () => {
    const { container } = render(<ProductEndorsementRail items={[]} />);

    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByRole("heading", { name: "Endorsed by familiar faces" }),
    ).not.toBeInTheDocument();
  });

  it("filters invalid or uncontrolled media before rendering", () => {
    const unsafeItems = [
      familiarFaceItems[0],
      {
        ...familiarFaceItems[1],
        alt: "",
      },
      {
        ...familiarFaceItems[2],
        src: "https://social.example/portrait.webp",
      },
    ] as unknown as readonly FamiliarFaceMedia[];

    expect(validFamiliarFaceMedia(unsafeItems)).toEqual([familiarFaceItems[0]]);
  });

  it("ships populated project-controlled media", () => {
    expect(productEndorsementMedia).toHaveLength(4);
    expect(productEndorsementMedia.every((item) => item.src.startsWith("/media/")))
      .toBe(true);
    expect(productEndorsementMedia.every((item) => !/https?:\/\//.test(item.src)))
      .toBe(true);
  });

  it("uses finite controls for project media without wraparound", async () => {
    const user = userEvent.setup();
    render(<ProductEndorsementRail items={familiarFaceItems} />);

    expect(
      screen.getByRole("heading", { name: "Endorsed by familiar faces" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /previous endorsement/i }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next endorsement/i }))
      .toBeInTheDocument();
    expect(screen.getAllByRole("img").map((image) => image.getAttribute("src")))
      .toHaveLength(3);
    expect(screen.getAllByRole("img").map((image) => image.getAttribute("alt")))
      .toEqual(familiarFaceItems.map((item) => item.alt));
    expect(screen.getAllByRole("img")[0]).toHaveStyle({
      objectPosition: "50% 40%",
    });

    await user.click(screen.getByRole("button", { name: /next endorsement/i }));
    expect(screen.getByRole("button", { name: /previous endorsement/i }))
      .toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next endorsement/i }));
    await user.click(screen.getByRole("button", { name: /next endorsement/i }));
    expect(screen.queryByRole("button", { name: /next endorsement/i }))
      .not.toBeInTheDocument();

    const rail = screen.getByRole("list", { name: "Familiar faces editorial images" });
    expect(rail.scrollLeft).toBe(600);
    fireEvent.keyDown(rail, { key: "ArrowLeft" });
    expect(rail.scrollLeft).toBeLessThan(600);
    expect(screen.getByRole("button", { name: /next endorsement/i }))
      .toBeInTheDocument();
  });
});
