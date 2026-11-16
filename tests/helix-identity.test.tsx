import { readFile } from "node:fs/promises";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelixIdentity } from "@/components/brand/HelixIdentity";
import { HELIX_IDENTITY_GEOMETRY } from "@/components/brand/HelixIdentity.geometry";

const assetDirectory = path.join(process.cwd(), "public", "brand");

describe("HelixIdentity", () => {
  it("exposes one accessible helix name while hiding its vector geometry", () => {
    const { container } = render(<HelixIdentity />);

    const wordmark = screen.getByRole("img", { name: "helix" });
    expect(wordmark).toHaveAttribute("data-helix-identity", "wordmark");
    expect(wordmark.querySelector("g")).toHaveAttribute("aria-hidden", "true");
    expect(wordmark.querySelector("text")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("renders a standalone symbol for compact contexts", () => {
    render(<HelixIdentity variant="symbol" label="helix" />);

    expect(screen.getByRole("img", { name: "helix" })).toHaveAttribute(
      "data-helix-identity",
      "symbol",
    );
  });

  it("inherits one color across every symbol and tail path", () => {
    const { container } = render(<HelixIdentity />);
    const paths = container.querySelectorAll("path");

    paths.forEach((geometry) => {
      expect(
        geometry.getAttribute("stroke") === "currentColor" ||
          geometry.closest('[fill="currentColor"]') !== null,
      ).toBe(true);
    });
  });

  it("can be decorative when the surrounding control already names the brand", () => {
    const { container } = render(<HelixIdentity decorative />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it.each([
    ["helix-symbol-black.svg", "#000"],
    ["helix-symbol-white.svg", "#fff"],
    ["helix-wordmark-black.svg", "#000"],
    ["helix-wordmark-white.svg", "#fff"],
  ])("delivers %s as fixed one-color vector geometry", async (file, color) => {
    const source = await readFile(path.join(assetDirectory, file), "utf8");

    expect(source).toContain(`<svg`);
    expect(source).toContain(color);
    expect(source).toContain(`<path`);
    expect(source).not.toContain(`<text`);
    expect(source).not.toContain(`currentColor`);
  });

  it.each([
    ["helix-symbol-black.svg", "symbol"],
    ["helix-symbol-white.svg", "symbol"],
    ["helix-wordmark-black.svg", "wordmark"],
    ["helix-wordmark-white.svg", "wordmark"],
  ] as const)("keeps %s in exact parity with the canonical geometry", async (file, variant) => {
    const source = await readFile(path.join(assetDirectory, file), "utf8");
    const document = new DOMParser().parseFromString(source, "image/svg+xml");
    const svg = document.documentElement;
    const paths = Array.from(svg.querySelectorAll("path"));

    expect(svg.getAttribute("viewBox")).toBe(
      HELIX_IDENTITY_GEOMETRY.viewBox[variant],
    );
    expect(paths.map((pathElement) => pathElement.getAttribute("d"))).toEqual([
      ...HELIX_IDENTITY_GEOMETRY.symbol.map(({ d }) => d),
      ...(variant === "wordmark"
        ? HELIX_IDENTITY_GEOMETRY.tail.map(({ d }) => d)
        : []),
    ]);
    expect(
      paths.slice(0, 2).map((pathElement) => ({
        strokeWidth: pathElement.getAttribute("stroke-width"),
        strokeLinecap: pathElement.getAttribute("stroke-linecap"),
      })),
    ).toEqual(
      HELIX_IDENTITY_GEOMETRY.symbol.map(({ strokeWidth, strokeLinecap }) => ({
        strokeWidth,
        strokeLinecap,
      })),
    );

    if (variant === "wordmark") {
      const tailGroup = svg.querySelector("g");
      expect(tailGroup).not.toBeNull();
      expect(tailGroup?.getAttribute("transform")).toBe(
        HELIX_IDENTITY_GEOMETRY.tailTransform,
      );
      expect(
        paths.slice(2).map((pathElement) => pathElement.getAttribute("transform")),
      ).toEqual(
        HELIX_IDENTITY_GEOMETRY.tail.map(({ transform }) => transform ?? null),
      );
    }
  });
});
