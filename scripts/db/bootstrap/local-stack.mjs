import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function localStack() {
  const nonce = randomBytes(6).toString("hex");
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), "helix-bootstrap-")));
  const project = path.join(directory, "project");
  const state = path.join(directory, "cli-state");
  const migrations = path.join(project, "supabase", "migrations");
  mkdirSync(migrations, { recursive: true, mode: 0o700 });
  mkdirSync(state, { mode: 0o700 });
  const cliPath = process.env.SUPABASE_CLI || "supabase";
  const socket =
    process.env.DOCKER_HOST ||
    spawnSync("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], {
      encoding: "utf8",
    }).stdout?.trim();
  assert.match(socket ?? "", /^unix:\/\/\/[^\n]+$/, "A local Docker Unix socket is required.");
  const env = {
    PATH: process.env.PATH,
    SUPABASE_HOME: state,
    SUPABASE_NO_KEYRING: "1",
    DO_NOT_TRACK: "1",
    SUPABASE_TELEMETRY_DISABLED: "1",
    DOCKER_HOST: socket,
    DOCKER_CONFIG: directory,
  };
  writeFileSync(
    path.join(project, "supabase/config.toml"),
    [
      'project_id = "helix-bootstrap-' + nonce + '"',
      "[api]",
      "enabled = true",
      "auto_expose_new_tables = false",
      "[db]",
      "major_version = 17",
      "[db.migrations]",
      "enabled = false",
      "[db.seed]",
      "enabled = false",
      "[auth]",
      "enabled = true",
      'site_url = "http://127.0.0.1:3000"',
      "[storage]",
      "enabled = true",
      "[realtime]",
      "enabled = false",
      "[studio]",
      "enabled = false",
      "[analytics]",
      "enabled = false",
      "[edge_runtime]",
      "enabled = false",
      "[experimental]",
      "stack = true",
      "[local.services.default]",
      'version = "bundled"',
      "[local.services.database]",
      'version = "17.12.0.000-r0"',
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  let stackId, container;
  const step = (exe, args, input, mayFail = false) => {
    const result = spawnSync(exe, args, {
      input,
      cwd: project,
      env,
      timeout: 300_000,
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && !mayFail) {
      // Raw CLI/status output can include locally issued keys. Only report bounded diagnostics.
      const diagnostic = result.stderr
        .toString()
        .split("\n")
        .filter((l) => /^(?:ERROR:|FATAL:|Error:|error:|psql:|pg_restore: error:)/.test(l))
        .slice(0, 2)
        .join(" ")
        .replace(
          /(?:https?:\/\/|postgres(?:ql)?:\/\/)\S+|eyJ[\w.-]+|(?:sb_secret_|sb_publishable_)\S+/g,
          "[redacted]",
        );
      throw Error(
        exe +
          " " +
          (exe === "docker" ? args[0] : "local command") +
          " failed (" +
          result.status +
          ") " +
          diagnostic.slice(0, 450),
      );
    }
    return result;
  };
  const docker = (args, input, mayFail) => step("docker", args, input, mayFail);
  const cli = (...args) =>
    step(cliPath, ["--workdir", project, "--output-format", "json", ...args]).stdout.toString();
  const owned = () =>
    JSON.parse(cli("stack", "list")).stacks.filter(
      (s) => s.project_root === project && s.runtime === "docker",
    );
  const exec = (args, input, mayFail) => {
    assert.match(container ?? "", /^[0-9a-f]{64}$/);
    return docker(["exec", "-i", container, ...args], input, mayFail);
  };
  const sql = (database, query, mayFail = false) =>
    exec(
      [
        "/opt/postgres/bin/psql",
        "-h",
        "/tmp",
        "-U",
        "supabase_admin",
        "-d",
        database,
        "-X",
        "-Atq",
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        "-",
      ],
      query,
      mayFail,
    );
  const testDatabase = (name) => {
    assert.match(name, new RegExp("^helix_bootstrap_(?:fresh_a|fresh_b|prefix|restore)_" + nonce + "$"));
  };
  const backup = (source) => {
    if (source !== "postgres") testDatabase(source);
    return exec([
      "/opt/postgres/bin/pg_dump",
      "-h",
      "/tmp",
      "-U",
      "supabase_admin",
      "--format=custom",
      source,
    ]).stdout;
  };
  const restore = (bytes, name) => {
    testDatabase(name);
    assert.equal(bytes.subarray(0, 5).toString(), "PGDMP", "Expected a real PostgreSQL backup");
    exec([
      "/opt/postgres/bin/createdb",
      "-h",
      "/tmp",
      "-U",
      "supabase_admin",
      "-T",
      "template0",
      "-O",
      "postgres",
      name,
    ]);
    const grants = sql(
      "postgres",
      "SELECT format('GRANT %s ON DATABASE %I TO %I%s', privilege_type, '" +
        name +
        "', pg_get_userbyid(grantee), CASE WHEN is_grantable THEN ' WITH GRANT OPTION' ELSE '' END) " +
        "FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) WHERE datname='postgres' AND grantee<>0 AND grantee<>datdba;",
    ).stdout.toString();
    if (grants.trim()) sql("postgres", grants.trim().split("\n").join(";\n") + ";");
    exec(
      [
        "/opt/postgres/bin/pg_restore",
        "-h",
        "/tmp",
        "-U",
        "supabase_admin",
        "-d",
        name,
        "--single-transaction",
        "--exit-on-error",
      ],
      bytes,
    );
  };
  const session = (name) => {
    testDatabase(name);
    return spawn(
      "docker",
      [
        "exec",
        "-i",
        container,
        "/opt/postgres/bin/psql",
        "-h",
        "/tmp",
        "-U",
        "postgres",
        "-d",
        name,
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { cwd: project, env, timeout: 60_000, stdio: ["pipe", "pipe", "pipe"] },
    );
  };
  return {
    nonce,
    migrations,
    directory,
    sql,
    cli,
    exec,
    docker,
    backup,
    restore,
    session,
    get container() {
      return container;
    },
    start() {
      const version = step(cliPath, ["--version"]).stdout.toString().trim();
      assert.equal(version, "3.1.0", "Use the tested Supabase CLI release");
      assert.equal(owned().length, 0);
      cli("start", "--runtime", "docker", "--eager");
      const stacks = owned();
      assert.equal(stacks.length, 1);
      stackId = stacks[0].id;
      const ids = docker([
        "ps",
        "-q",
        "--no-trunc",
        "--filter",
        "label=com.supabase.stack=" + stackId,
        "--filter",
        "label=com.supabase.service=database",
      ])
        .stdout.toString()
        .trim()
        .split("\n");
      assert.equal(ids.length, 1);
      container = ids[0];
      const root = JSON.parse(
        docker([
          "inspect",
          "--format",
          '{{json (index .Config.Labels "com.supabase.stack-root")}}',
          container,
        ]).stdout,
      );
      assert.equal(realpathSync(root), realpathSync(path.join(state, "stacks", stackId, "data")));
      for (const address of JSON.parse(
        docker(["inspect", "--format", "{{json .NetworkSettings.Ports}}", container]).stdout,
      )["5432/tcp"] ?? []) {
        assert.equal(address.HostIp, "127.0.0.1");
      }
      assert.equal(sql("postgres", "show server_version_num;").stdout.toString().trim(), "170012");
    },
    cleanup() {
      const stacks = owned();
      for (const stack of stacks) {
        assert.ok(!stackId || stack.id === stackId);
        cli("stack", "stop", "--stack-id", stack.id);
        cli("stack", "destroy", "--stack-id", stack.id, "--yes");
      }
      assert.equal(owned().length, 0);
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
