export class RewardsServiceUnavailableError extends Error {
  constructor() {
    super("helix rewards is temporarily unavailable.");
    this.name = "RewardsServiceUnavailableError";
  }
}

export class RewardsRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RewardsRequestError";
  }
}
