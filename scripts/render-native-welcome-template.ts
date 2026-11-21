// Offline source for the single published template selected by the welcome Automation.
import { nativeWelcomeTemplate } from "../lib/production-marketing/template-content";

process.stdout.write(JSON.stringify(nativeWelcomeTemplate(), null, 2) + "\n");
