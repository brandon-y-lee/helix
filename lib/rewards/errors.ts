export class RewardsServiceUnavailableError extends Error {
  constructor() {
    super("helix rewards is temporarily unavailable.");
    this.name = "RewardsServiceUnavailableError";
  }
}
