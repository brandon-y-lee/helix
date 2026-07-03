import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeFinalVideo } from "@/components/HomeFinalVideo";

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

describe("HomeFinalVideo", () => {
  it("mounts a muted looping mp4 when motion is allowed", async () => {
    mockReducedMotion(false);

    const { container } = render(<HomeFinalVideo />);

    expect(container.querySelector(".home-final-media__poster")?.getAttribute("src"))
      .toContain("final-cta-poster.webp");

    await waitFor(() => {
      expect(container.querySelector("video")).toBeInTheDocument();
    });

    const mediaShell = container.querySelector(".home-final-media");
    const video = container.querySelector("video");
    const source = container.querySelector("source");

    expect(mediaShell).toHaveAttribute("data-motion-state", "pending");
    expect(mediaShell).toHaveAttribute("data-video-ready", "false");
    expect(video).toHaveAttribute("poster", "/media/home/final-cta-poster.webp");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveAttribute("aria-hidden", "true");
    expect(video).not.toHaveAttribute("controls");
    expect(source).toHaveAttribute("src", "/media/home/final-cta-loop.mp4");
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

  it("keeps the poster static for reduced-motion users", () => {
    mockReducedMotion(true);

    const { container } = render(<HomeFinalVideo />);

    expect(container.querySelector(".home-final-media__poster")).toBeInTheDocument();
    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(container.querySelector(".home-final-media")).toHaveAttribute(
      "data-motion-state",
      "static",
    );
  });

  it("falls back to the poster when video loading fails", async () => {
    mockReducedMotion(false);

    const { container } = render(<HomeFinalVideo />);

    await waitFor(() => {
      expect(container.querySelector("video")).toBeInTheDocument();
    });

    fireEvent.error(container.querySelector("video") as HTMLVideoElement);

    await waitFor(() => {
      expect(container.querySelector(".home-final-media")).toHaveAttribute(
        "data-motion-state",
        "failed",
      );
      expect(container.querySelector(".home-final-media")).toHaveAttribute(
        "data-video-ready",
        "false",
      );
    });
    expect(container.querySelector(".home-final-media__poster")).toBeInTheDocument();
  });
});
