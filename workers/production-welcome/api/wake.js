import { withNativeWelcomeDatabase } from "../database.mjs";
import { handleWake } from "../publisher.mjs";

export async function POST(request) {
  return handleWake(request, process.env, { withDatabase: withNativeWelcomeDatabase });
}
