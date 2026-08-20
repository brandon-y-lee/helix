import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HomeBackgroundVideo,
  type HomeBackgroundVideoPlacement,
} from "@/components/home/HomeBackgroundVideo";

const lazyPlacements: Array<{
  placement: HomeBackgroundVideoPlacement;
  frameClassName: string;
  poster: string;
  sources: [string, string];
}> = [
  {
    placement: "plug",
    frameClassName: "home-plug-media__frame",
    poster: "/media/home/plug-and-play-poster.webp",
    sources: [
      "/media/home/plug-and-play-loop.webm?v=72384950eb3e",
      "/media/home/plug-and-play-loop.mp4?v=4907f7e08e94",
    ],
  },
  {
    placement: "final",
    frameClassName: "home-final-media",
    poster: "/media/home/final-cta-poster.webp",
    sources: [
      "/media/home/final-cta-loop.webm?v=8de3ea79725b",
      "/media/home/final-cta-loop.mp4?v=0fc8a75fd1c4",
    ],
  },
];

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

function sourceUrls(container: HTMLElement) {
  return Array.from(container.querySelectorAll("source"), (source) =>
    source.getAttribute("src"),
  );
}

afterEach(() => {
  notifyIntersection = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HomeBackgroundVideo", () => {
  it("uses the eager hero media and reports playback and failure states", async () => {
    mockReducedMotion(false);
    const { container } = render(<HomeBackgroundVideo placement="hero" />);

    await waitFor(() => expect(container.querySelector("video")).toBeInTheDocument());

    const mediaShell = container.querySelector(".home-video-hero__media");
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).toHaveAttribute(
      "poster",
      "/media/home/helix-hero-poster.webp",
    );
    expect(video).toHaveAttribute("preload", "metadata");
    expect(sourceUrls(container)).toEqual([
      "/media/home/helix-hero.webm?v=469b5c0022c8",
      "/media/home/helix-hero.mp4?v=7048d1daaa75",
    ]);
    expect(video.autoplay).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);

    fireEvent.playing(video);
    await waitFor(() => {
      expect(mediaShell).toHaveAttribute("data-motion-state", "motion");
      expect(mediaShell).toHaveAttribute("data-video-ready", "true");
    });

    fireEvent.waiting(video);
    expect(mediaShell).toHaveAttribute("data-motion-state", "pending");

    fireEvent.error(video);
    await waitFor(() => {
      expect(mediaShell).toHaveAttribute("data-motion-state", "failed");
      expect(mediaShell).toHaveAttribute("data-video-ready", "false");
    });
    expect(container.querySelector(".home-video-hero__poster")).toBeInTheDocument();
  });

  it.each(lazyPlacements)(
    "defers the $placement sources until its section enters the viewport",
    async ({ placement, frameClassName, poster, sources }) => {
      mockReducedMotion(false);
      mockIntersectionObserver();
      const { container } = render(
        <HomeBackgroundVideo placement={placement} />,
      );

      await waitFor(() => {
        expect(container.querySelector(`.${frameClassName}`)).toHaveAttribute(
          "data-motion-state",
          "pending",
        );
      });
      expect(container.querySelector("video")).not.toBeInTheDocument();

      act(() => notifyIntersection?.(true));
      await waitFor(() => expect(container.querySelector("video")).toBeInTheDocument());

      expect(container.querySelector("video")).toHaveAttribute("poster", poster);
      expect(container.querySelector("video")).toHaveAttribute("preload", "none");
      expect(sourceUrls(container)).toEqual(sources);
    },
  );

  it("keeps only the poster active for reduced-motion users", () => {
    mockReducedMotion(true);
    const { container } = render(<HomeBackgroundVideo placement="final" />);

    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(container.querySelector(".home-final-media")).toHaveAttribute(
      "data-motion-state",
      "static",
    );
  });

  it("retries rejected playback when a lazy video re-enters view", async () => {
    mockReducedMotion(false);
    mockIntersectionObserver();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new Error("Playback was temporarily unavailable"))
      .mockResolvedValue(undefined);
    const { container } = render(<HomeBackgroundVideo placement="final" />);

    act(() => notifyIntersection?.(true));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));

    act(() => notifyIntersection?.(false));
    act(() => notifyIntersection?.(true));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));

    fireEvent.playing(container.querySelector("video") as HTMLVideoElement);
    expect(container.querySelector(".home-final-media")).toHaveAttribute(
      "data-motion-state",
      "motion",
    );
  });
});
