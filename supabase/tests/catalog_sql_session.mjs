// Bounded, synchronized psql sessions for local Catalog operation tests.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

export function createSqlSession(psql) {
  const child = spawn("docker", psql, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let errors = "";
  let milestone;
  const timeout = setTimeout(() => child.kill(), 30_000);
  const done = new Promise((resolveDone, rejectDone) => {
    child.stdout.on("data", (chunk) => {
      output += chunk;
      milestone?.();
    });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", rejectDone);
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolveDone({ status, output, errors });
    });
  });
  done.catch(() => {});
  return {
    child,
    done,
    async send(sql) {
      const marker = `CATALOG_MILESTONE_${randomBytes(8).toString("hex")}`;
      const offset = output.length;
      const reached = new Promise((resolveReached) => {
        milestone = () => {
          const index = output.indexOf(marker, offset);
          if (index !== -1) resolveReached(output.slice(offset, index).trim());
        };
      });
      child.stdin.write(`${sql}\n\\echo ${marker}\n`);
      try {
        return await Promise.race([reached, done.then((result) => {
          throw new Error(`SQL session ended before its milestone: ${result.errors}`);
        })]);
      } finally {
        milestone = undefined;
      }
    },
    finish(sql) {
      child.stdin.end(sql);
      return done;
    },
  };
}

export function requireSqlstate(result, expected) {
  assert.notEqual(result.status, 0, "Catalog operation unexpectedly succeeded");
  assert.match(result.errors, new RegExp(`ERROR:  ${expected}:`));
}

