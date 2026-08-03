import { act, fireEvent, render, waitFor } from "@testing-library/react";
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

let notifyIntersection: ((isIntersecting: boolean) => void) | null = null;

function mockIntersectionObserver() {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        notifyIntersection = (isIntersecting) => {
          callback(
            [{ isIntersecting } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        };
      }

      observe() {}
      disconnect() {}
    },
  );
}

afterEach(() => {
  notifyIntersection = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HomeFinalVideo", () => {
  it("defers its muted looping video sources until the section enters the viewport", async () => {
    mockReducedMotion(false);
    mockIntersectionObserver();

    const { container } = render(<HomeFinalVideo />);

    expect(container.querySelector(".home-final-media__poster")?.getAttribute("src"))
      .toContain("final-cta-poster.webp");

    await waitFor(() => {
      expect(container.querySelector(".home-final-media")).toHaveAttribute(
        "data-motion-state",
        "pending",
      );
    });
    expect(container.querySelector("video")).not.toBeInTheDocument();

    act(() => notifyIntersection?.(true));

    await waitFor(() => {
      expect(container.querySelector("video")).toBeInTheDocument();
    });

    const mediaShell = container.querySelector(".home-final-media");
    const video = container.querySelector("video");
    const sources = Array.from(container.querySelectorAll("source"));

    expect(mediaShell).toHaveAttribute("data-motion-state", "pending");
    expect(mediaShell).toHaveAttribute("data-video-ready", "false");
    expect(video).toHaveAttribute("poster", "/media/home/final-cta-poster.webp");
    expect(video).toHaveAttribute("preload", "none");
    expect(video).toHaveAttribute("aria-hidden", "true");
    expect(video).not.toHaveAttribute("controls");
    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveAttribute(
      "src",
      "/media/home/final-cta-loop.webm?v=8de3ea79725b",
    );
    expect(sources[0]).toHaveAttribute("type", "video/webm");
    expect(sources[1]).toHaveAttribute(
      "src",
      "/media/home/final-cta-loop.mp4?v=0fc8a75fd1c4",
    );
    expect(sources[1]).toHaveAttribute("type", "video/mp4");
    expect(video?.autoplay).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.muted).toBe(true);
    expect(video?.defaultMuted).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(video?.controls).toBe(false);

    fireEvent.loadedData(video as HTMLVideoElement);

    expect(mediaShell).toHaveAttribute("data-motion-state", "pending");
    expect(mediaShell).toHaveAttribute("data-video-ready", "false");

    fireEvent.playing(video as HTMLVideoElement);

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

  it("retries playback after a transient rejection when the section re-enters view", async () => {
    mockReducedMotion(false);
    mockIntersectionObserver();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new Error("Playback was temporarily unavailable"))
      .mockResolvedValue(undefined);

    const { container } = render(<HomeFinalVideo />);

    act(() => notifyIntersection?.(true));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(container.querySelector(".home-final-media")).toHaveAttribute(
      "data-motion-state",
      "pending",
    );

    act(() => notifyIntersection?.(false));
    act(() => notifyIntersection?.(true));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));

    fireEvent.playing(container.querySelector("video") as HTMLVideoElement);
    expect(container.querySelector(".home-final-media")).toHaveAttribute(
      "data-motion-state",
      "motion",
    );
  });

  it("falls back to the poster when video loading fails", async () => {
    mockReducedMotion(false);
    mockIntersectionObserver();

    const { container } = render(<HomeFinalVideo />);

    act(() => notifyIntersection?.(true));

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
