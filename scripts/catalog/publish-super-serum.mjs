import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { register } from "tsx/esm/api";

// Next supplies this server marker alias during app builds. Use its same empty
// server implementation in this privileged Node CLI, without changing app code.
const require = createRequire(import.meta.url);
const marker = pathToFileURL(require.resolve("next/dist/compiled/server-only/empty.js")).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "server-only"
      ? { url: marker, shortCircuit: true }
      : nextResolve(specifier, context);
  },
});
register();
// Import even for --help so the local smoke check exercises the real service.
const { runSuperSerumPublication, PublicationError } = await import("./super-serum-publication.ts");
const usage = "node scripts/catalog/publish-super-serum.mjs <plan|apply|verify> --actor <existing-admin-uuid> --expected-revision <base-revision> [--target available|coming_soon]";

try {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === "--help" && args.length === 0) {
    console.log(`${usage}\nReuse the same base revision for verify/retry. coming_soon publishes rollback.\nStock flags are sandbox fixtures. Cache, webhooks, Algolia and storefront verification remain separate.`);
  } else {
    const flags = new Map();
    for (let index = 0; index < args.length; index += 2) {
      const name = args[index];
      const value = args[index + 1];
      if (!["--actor", "--expected-revision", "--target"].includes(name) || !value || flags.has(name)) {
        throw new PublicationError(usage);
      }
      flags.set(name, value);
    }
    const result = await runSuperSerumPublication({
      mode, actorId: flags.get("--actor"),
      expectedRevision: Number(flags.get("--expected-revision")),
      target: flags.get("--target") ?? "available",
    });
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(error instanceof PublicationError ? error.message :
    "Catalog operation failed. Preserve any draft; inspect Admin and run verify with the same base revision before retrying. Provider details were omitted.");
  process.exitCode = 1;
}
