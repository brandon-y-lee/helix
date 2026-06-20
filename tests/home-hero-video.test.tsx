import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeHeroVideo } from "@/components/HomeHeroVideo";

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HomeHeroVideo", () => {
  it("mounts a muted looping mp4 video when motion is allowed", async () => {
    mockReducedMotion(false);

    const { container } = render(<HomeHeroVideo />);

    expect(
      container.querySelector(".home-video-hero__poster")?.getAttribute("src"),
    ).toContain("mei-pelle-hero-poster.webp");

    await waitFor(() => {
      expect(container.querySelector("video")).toBeInTheDocument();
    });

    const mediaShell = container.querySelector(".home-video-hero__media");
    const video = container.querySelector("video");
    const source = container.querySelector("source");

    expect(mediaShell).toHaveAttribute("data-motion-state", "pending");
    expect(mediaShell).toHaveAttribute("data-video-ready", "false");
    expect(video).toHaveAttribute("poster", "/media/home/mei-pelle-hero-poster.webp");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveAttribute("aria-hidden", "true");
    expect(video).not.toHaveAttribute("controls");
    expect(source).toHaveAttribute("src", "/media/home/mei-pelle-hero.mp4");
    expect(source).toHaveAttribute("type", "video/mp4");

    expect(video?.autoplay).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.muted).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(video?.controls).toBe(false);

    fireEvent.loadedData(video as HTMLVideoElement);

    await waitFor(() => {
      expect(mediaShell).toHaveAttribute("data-motion-state", "motion");
      expect(mediaShell).toHaveAttribute("data-video-ready", "true");
    });
  });

  it("keeps the poster static when the user prefers reduced motion", async () => {
    mockReducedMotion(true);

    const { container } = render(<HomeHeroVideo />);

    expect(container.querySelector(".home-video-hero__poster")).toBeInTheDocument();
    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(container.querySelector(".home-video-hero__media")).toHaveAttribute(
      "data-motion-state",
      "static",
    );
  });

  it("falls back to the poster while keeping hero copy usable if the video cannot load", async () => {
    mockReducedMotion(false);

    const { container } = render(
      <section>
        <HomeHeroVideo />
        <h1>Ascension awaits.</h1>
        <a href="/products">EXPLORE NOW</a>
      </section>,
    );

    await waitFor(() => {
      expect(container.querySelector("video")).toBeInTheDocument();
    });

    fireEvent.error(container.querySelector("video") as HTMLVideoElement);

    await waitFor(() => {
      expect(container.querySelector("video")).toBeInTheDocument();
      expect(container.querySelector(".home-video-hero__media")).toHaveAttribute(
        "data-motion-state",
        "failed",
      );
      expect(container.querySelector(".home-video-hero__media")).toHaveAttribute(
        "data-video-ready",
        "false",
      );
    });
    expect(container.querySelector(".home-video-hero__poster")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Ascension awaits." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "EXPLORE NOW" })).toHaveAttribute(
      "href",
      "/products",
    );
  });
});
