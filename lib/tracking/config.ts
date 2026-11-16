import { readPaymentProviderConfig } from "@/lib/checkout/config";

/** Hosted development uses a production build; commerce mode is the authority. */
export function isOrderSimulationEnvironmentAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.HELIX_EMAIL_ENVIRONMENT !== "sandbox"
    || env.HELIX_EMAIL_MODE !== "restricted") return false;
  try { return readPaymentProviderConfig(env).environment === "sandbox"; }
  catch { return false; }
}

export function isOrderSimulationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HELIX_ORDER_SIMULATION_ENABLED === "true" && isOrderSimulationEnvironmentAllowed(env);
}
