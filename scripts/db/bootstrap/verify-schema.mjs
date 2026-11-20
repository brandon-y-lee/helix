import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(
    new URL("../../../supabase/bootstrap/development/expected-schema.json", import.meta.url),
    "utf8",
  ),
);
const profile = "on_auth_user_created_profile";
const rewards = "on_auth_user_created_rewards";
const loyalty = "on_auth_user_created_loyalty";

/**
 * Compare the output of verify-schema.sql at the parent, reconstructed base,
 * or development stage. A retained legacy trigger must prove identity against
 * the partial child's fingerprint from BEFORE the upgrade.
 */
export function verifySchema(report, stage, { previousAuthHooks, managedBefore } = {}) {
  assert.ok(["parent", "base", "dev"].includes(stage), "Unknown database verification stage");
  assert.equal(report.searchPathPinned, true, "Pin search_path=pg_catalog before the metadata query");
  assert.deepEqual(report.runtimeRoles, ["anon", "authenticated", "service_role"]);
  assert.deepEqual(
    report.runtimeRoleBoundaries,
    manifest.runtimeRoleBoundaries,
    "Role trust or RLS bypass drift",
  );
  assert.equal(
    report.delegablePrivilegeCount,
    manifest.delegablePrivilegeCount,
    "Runtime role can delegate access",
  );
  const isParent = stage === "parent";
  const expectedObjects =
    stage === "dev" ? manifest.afterDevelopmentChanges : manifest.applicationObjects;
  assert.deepEqual(report.objects, expectedObjects, "Application schema definition or ownership drift");
  assert.deepEqual(
    report.effectivePrivileges,
    manifest.effectivePrivileges[stage],
    "Runtime privilege drift",
  );
  assert.equal(report.defaultClientTruncateGrant, false, "Client TRUNCATE must stay revoked");
  assert.deepEqual(
    report.defaultRuntimeGrants,
    manifest.publicDefaultPrivileges[isParent ? "parent" : "development"],
    "Default privilege drift",
  );

  assert.deepEqual(
    report.mediaProjectBindings,
    {
      erasogmsqpgiirovubjh: isParent,
      zyfkunnpnlmgvrojmrbg: !isParent,
    },
    "Catalog media must bind only to the verified project",
  );
  const actual = report.authHooks;
  const secondHook = previousAuthHooks ? loyalty : rewards;
  assert.deepEqual(Object.keys(actual).sort(), [profile, secondHook].sort(), "Unexpected Auth hook");
  for (const hook of [profile, secondHook]) {
    assert.equal(actual[hook].canonical, true, "Expected one canonical enabled AFTER INSERT Auth hook");
    if (previousAuthHooks) {
      assert.match(
        previousAuthHooks[hook]?.triggerOid ?? "",
        /^[1-9]\d*$/,
        "Missing original Auth trigger OID",
      );
      assert.match(
        previousAuthHooks[hook]?.handlerOid ?? "",
        /^[1-9]\d*$/,
        "Missing original Auth handler OID",
      );
      assert.equal(
        actual[hook].triggerOid,
        previousAuthHooks[hook].triggerOid,
        "Replaced managed Auth trigger",
      );
      assert.equal(
        actual[hook].handlerOid,
        previousAuthHooks[hook].handlerOid,
        "Replaced Auth trigger handler",
      );
    }
  }

  assert.deepEqual(
    report.realtimeMembers,
    manifest.managed.parentRealtimeMembers,
    "Unexpected Realtime publication membership",
  );
  assert.equal(
    report.environmentCatalogHookCount,
    isParent ? manifest.managed.parentCatalogNotifications : 0,
    "Unexpected Catalog notification routing",
  );
  if (isParent) {
    assert.equal(report.managedStorageTriggerCount, manifest.managed.parentStorageTriggers);
    assert.equal(report.managedRealtimePublication, manifest.managed.parentRealtimePublication);
    assert.deepEqual(report.effectiveMaintenanceGrants, manifest.parentRuntimeMaintenancePrivileges);
  } else {
    for (const role of report.runtimeRoles) {
      assert.deepEqual(
        report.effectiveMaintenanceGrants[role],
        { TRUNCATE: 0, TRIGGER: 0, MAINTAIN: 0, REFERENCES: 0 },
        "Runtime role holds an owner privilege",
      );
    }
  }
  if (managedBefore) {
    assert.equal(
      report.managedStorageTriggerCount,
      managedBefore.managedStorageTriggerCount,
      "Storage trigger inventory changed during bootstrap",
    );
    assert.equal(
      report.managedRealtimePublication,
      managedBefore.managedRealtimePublication,
      "Managed Realtime publication changed during bootstrap",
    );
  }
}
