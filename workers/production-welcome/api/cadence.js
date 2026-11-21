import { runCadence } from "../cadence.mjs";
import { POST as wake } from "./wake.js";

export function POST(request) {
  return runCadence(request, process.env, { wake });
}
