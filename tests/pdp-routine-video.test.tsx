import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdpRoutineVideo } from "@/components/product-detail/PdpRoutineVideo";
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

function controlMobileViewport(initialMobile: boolean) {
  let mobile = initialMobile;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 820px)" && mobile,
    media: query,
    addEventListener: (_event: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) =>
      listeners.delete(listener),
  }));
  return (nextMobile: boolean) => {
    act(() => {
      mobile = nextMobile;
      listeners.forEach((listener) => listener());
    });
  };
}

afterEach(() => vi.unstubAllGlobals());

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
  it("serves one native video stream to the mobile pilot through hydration", () => {
    controlMobileViewport(true);
    const routine = (
      <PdpRoutineVideo
        productName="Super Serum"
        overlay="See how Super Serum works in your skin routine."
        video={video}
        poster={poster}
        swatch={["#d9d1c4", "#877464"]}
        pdpPresentation="mobile-pilot"
      />
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(routine);
    expect(container.querySelectorAll("video")).toHaveLength(1);
    const foreground = container.querySelector("video");

    document.body.append(container);
    render(routine, { container, hydrate: true });
    expect(container.querySelectorAll("video")).toHaveLength(1);
    expect(container.querySelector("video")).toBe(foreground);
    expect(foreground).toHaveAttribute("controls");
    expect(foreground).toHaveAttribute("playsinline");
    expect(playMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Play Super Serum routine video" }),
    ).toBeInTheDocument();
  });

  it("keeps foreground playback across resize and retires only the decorative stream", async () => {
    const resize = controlMobileViewport(false);
    const user = userEvent.setup();
    render(
      <PdpRoutineVideo
        productName="Super Serum"
        overlay="See how Super Serum works in your skin routine."
        video={video}
        poster={poster}
        swatch={["#d9d1c4", "#877464"]}
        pdpPresentation="mobile-pilot"
      />,
    );
    const foreground = document.querySelector(
      ".pdp-routine-video__foreground",
    ) as HTMLVideoElement;
    const background = document.querySelector(
      ".pdp-routine-video__background",
    ) as HTMLVideoElement;
    let paused = false;
    Object.defineProperty(foreground, "paused", { get: () => paused });

    await user.click(
      screen.getByRole("button", { name: "Play Super Serum routine video" }),
    );
    foreground.currentTime = 12;
    foreground.playbackRate = 1.5;
    fireEvent.play(foreground);
    fireEvent.canPlay(background);
    expect(background.currentTime).toBe(12);
    expect(background).toHaveAttribute("data-ready", "true");
    pauseMock.mockClear();
    playMock.mockClear();

    resize(true);
    expect(document.querySelectorAll("video")).toHaveLength(1);
    expect(document.querySelector("video")).toBe(foreground);
    expect(foreground.currentTime).toBe(12);
    expect(foreground.paused).toBe(false);
    expect(pauseMock.mock.contexts).toContain(background);
    expect(pauseMock.mock.contexts).not.toContain(foreground);
    expect(
      screen.queryByRole("button", { name: /Play.*routine video/ }),
    ).toBeNull();

    resize(false);
    const resumedBackground = document.querySelector(
      ".pdp-routine-video__background",
    ) as HTMLVideoElement;
    expect(document.querySelectorAll("video")).toHaveLength(2);
    expect(document.querySelector(".pdp-routine-video__foreground")).toBe(
      foreground,
    );
    expect(resumedBackground).not.toBe(background);
    expect(resumedBackground).toHaveAttribute("data-ready", "false");
    expect(resumedBackground.currentTime).toBe(12);
    expect(resumedBackground.playbackRate).toBe(1.5);
    expect(playMock.mock.contexts).toContain(resumedBackground);
    expect(playMock.mock.contexts).not.toContain(foreground);

    paused = true;
    fireEvent.pause(foreground);
    playMock.mockClear();
    resize(true);
    resize(false);
    expect(playMock).not.toHaveBeenCalled();
  });

  it("starts paused with an accessible poster overlay and native controls", () => {
    render(
      <PdpRoutineVideo
        productName="CLEANSE"
        overlay="See how CLEANSE works in your skin routine."
        video={video}
        poster={poster}
        swatch={["#d9d1c4", "#877464"]}
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
    expect(foreground).not.toHaveAttribute("poster");
    expect(foreground).toHaveAttribute("controls");
    expect(foreground).toHaveAttribute("playsinline");
    expect(foreground).toHaveAttribute("preload", "metadata");
    expect(foreground).not.toHaveAttribute("autoplay");
    expect(foreground).not.toHaveAttribute("loop");
    expect(background).toHaveAttribute("aria-hidden", "true");
    expect(background).toHaveAttribute("tabindex", "-1");
    expect((background as HTMLVideoElement).muted).toBe(true);
    expect(screen.getByRole("img", { name: poster.alt })).toBeInTheDocument();
  });

  it("activates only on request and synchronizes play, pause, seek, and rate", async () => {
    const user = userEvent.setup();
    render(
      <PdpRoutineVideo
        productName="CLEANSE"
        overlay="See how CLEANSE works in your skin routine."
        video={video}
        poster={poster}
        swatch={["#d9d1c4", "#877464"]}
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

  it.each(["default", "mobile-pilot"] as const)(
    "keeps the product poster and exposes an honest retry state on error (%s)",
    async (pdpPresentation) => {
      controlMobileViewport(true);
      const user = userEvent.setup();
      render(
        <PdpRoutineVideo
          productName="CLEANSE"
          overlay="See how CLEANSE works in your skin routine."
          video={video}
          poster={poster}
          swatch={["#d9d1c4", "#877464"]}
          pdpPresentation={pdpPresentation}
        />,
      );
      const foreground = document.querySelector(
        ".pdp-routine-video__foreground",
      ) as HTMLVideoElement;

      fireEvent.error(foreground);
      expect(
        screen.getByText("This routine video could not be loaded."),
      ).toBeInTheDocument();
      expect(foreground).not.toHaveAttribute("poster");
      expect(foreground).toHaveAttribute("src", video.url);

      await user.click(screen.getByRole("button", { name: "Retry" }));
      expect(loadMock).toHaveBeenCalledTimes(
        pdpPresentation === "mobile-pilot" ? 1 : 2,
      );
      expect(document.querySelector(".pdp-routine-video__foreground")).toBe(
        foreground,
      );
      expect(
        screen.getByRole("button", { name: "Play CLEANSE routine video" }),
      ).toBeInTheDocument();
    },
  );

  it("falls back only the failed routine poster position", () => {
    render(
      <PdpRoutineVideo
        productName="CLEANSE"
        overlay="See how CLEANSE works in your skin routine."
        video={video}
        poster={poster}
        swatch={["#d9d1c4", "#877464"]}
      />,
    );

    const foregroundPoster = screen.getByRole("img", { name: poster.alt });
    const position = foregroundPoster.closest("[data-media-kind]");
    fireEvent.error(foregroundPoster);

    expect(position).toHaveAttribute("data-media-kind", "placeholder");
    expect(position).toHaveAttribute("data-media-fallback", "load-error");
    expect(
      screen.getByRole("status", {
        name: `${poster.alt} could not be loaded.`,
      }),
    ).toBeInTheDocument();
    expect(
      document.querySelector(".pdp-routine-video__foreground"),
    ).toHaveAttribute("src", video.url);
  });
});
