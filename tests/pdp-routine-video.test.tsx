import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdpRoutineVideo } from "@/components/PdpRoutineVideo";
import type { ProductMedia } from "@/lib/products";

const video: ProductMedia = {
  kind: "video",
  url: "https://example.supabase.co/routine.mp4",
  alt: "CLEANSE routine application video.",
  width: 720,
  height: 1280,
  role: "routine_video",
  sortOrder: 20,
  paletteId: null,
  palette: null,
};

const poster: ProductMedia = {
  kind: "image",
  url: "https://example.supabase.co/routine-poster.webp",
  alt: "CLEANSE routine video poster.",
  width: 720,
  height: 1280,
  role: "routine_video_poster",
  sortOrder: 21,
  paletteId: null,
  palette: null,
};

const playMock = vi.fn<() => Promise<void>>();
const pauseMock = vi.fn<() => void>();
const loadMock = vi.fn<() => void>();

beforeEach(() => {
  playMock.mockReset();
  playMock.mockResolvedValue();
  pauseMock.mockReset();
  loadMock.mockReset();
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: playMock,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: pauseMock,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "load", {
    configurable: true,
    value: loadMock,
  });
});

describe("PdpRoutineVideo", () => {
  it("starts paused with an accessible poster overlay and native controls", () => {
    render(
      <PdpRoutineVideo
        productName="CLEANSE"
        overlay="See how CLEANSE works in your skin routine."
        video={video}
        poster={poster}
      />,
    );

    expect(playMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("See how CLEANSE works in your skin routine."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Play CLEANSE routine video" }),
    ).toBeInTheDocument();

    const foreground = document.querySelector(
      ".pdp-routine-video__foreground",
    );
    const background = document.querySelector(
      ".pdp-routine-video__background",
    );
    expect(foreground).toHaveAttribute("poster", poster.url);
    expect(foreground).toHaveAttribute("controls");
    expect(foreground).toHaveAttribute("playsinline");
    expect(foreground).toHaveAttribute("preload", "metadata");
    expect(foreground).not.toHaveAttribute("autoplay");
    expect(foreground).not.toHaveAttribute("loop");
    expect(background).toHaveAttribute("aria-hidden", "true");
    expect(background).toHaveAttribute("tabindex", "-1");
    expect((background as HTMLVideoElement).muted).toBe(true);
  });

  it("activates only on request and synchronizes play, pause, seek, and rate", async () => {
    const user = userEvent.setup();
    render(
      <PdpRoutineVideo
        productName="CLEANSE"
        overlay="See how CLEANSE works in your skin routine."
        video={video}
        poster={poster}
      />,
    );
    const foreground = document.querySelector(
      ".pdp-routine-video__foreground",
    ) as HTMLVideoElement;
    const background = document.querySelector(
      ".pdp-routine-video__background",
    ) as HTMLVideoElement;

    await user.click(
      screen.getByRole("button", { name: "Play CLEANSE routine video" }),
    );
    expect(playMock).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Play CLEANSE routine video" }),
    ).not.toBeInTheDocument();

    foreground.currentTime = 8;
    background.currentTime = 0;
    fireEvent.play(foreground);
    expect(playMock).toHaveBeenCalledTimes(2);
    expect(background.currentTime).toBe(8);

    foreground.currentTime = 15;
    fireEvent.seeking(foreground);
    expect(background.currentTime).toBe(15);

    foreground.playbackRate = 1.5;
    fireEvent.rateChange(foreground);
    expect(background.playbackRate).toBe(1.5);

    fireEvent.pause(foreground);
    expect(pauseMock).toHaveBeenCalled();

    fireEvent.ended(foreground);
    fireEvent.play(foreground);
    expect(playMock).toHaveBeenCalledTimes(3);
  });

  it("keeps the product poster and exposes an honest retry state on error", async () => {
    const user = userEvent.setup();
    render(
      <PdpRoutineVideo
        productName="CLEANSE"
        overlay="See how CLEANSE works in your skin routine."
        video={video}
        poster={poster}
      />,
    );
    const foreground = document.querySelector(
      ".pdp-routine-video__foreground",
    ) as HTMLVideoElement;

    fireEvent.error(foreground);
    expect(
      screen.getByText("This routine video is temporarily unavailable."),
    ).toBeInTheDocument();
    expect(foreground).toHaveAttribute("poster", poster.url);
    expect(foreground).toHaveAttribute("src", video.url);

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(loadMock).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("button", { name: "Play CLEANSE routine video" }),
    ).toBeInTheDocument();
  });
});
