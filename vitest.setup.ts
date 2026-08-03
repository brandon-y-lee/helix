import "@testing-library/jest-dom/vitest";

// jsdom intentionally leaves media playback unimplemented. Keep that test
// environment concern here so production components use the real media API.
Object.defineProperty(HTMLMediaElement.prototype, "play", {
  configurable: true,
  writable: true,
  value: () => Promise.resolve(),
});

Object.defineProperty(HTMLMediaElement.prototype, "pause", {
  configurable: true,
  writable: true,
  value: () => undefined,
});
