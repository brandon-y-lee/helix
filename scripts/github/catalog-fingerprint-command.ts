import { getProducts } from "../../lib/catalog";
import { fingerprintCatalog } from "./verification-fingerprints";

const fingerprint = fingerprintCatalog(await getProducts());
process.stdout.write(`${fingerprint}\n`);
