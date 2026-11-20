import { describe, expect, it, vi } from "vitest";
import { executeRelease } from "../scripts/release/workflow.mjs";

const old = { id: "dpl_previous", sha: "a".repeat(40), url: "https://old.vercel.app" };
const next = { id: "dpl_candidate", sha: "b".repeat(40), url: "https://next.vercel.app" };
function fixture() {
  let serving = "previous";
  const inspect = vi.fn(async () => ({ previous: old, candidate: next, serving }));
  const controller = {
    inspect, inspectRecovery: inspect, terminalFailedRollback: vi.fn(async () => null), confirmedFailedPromotion: vi.fn(async () => false), promote: vi.fn(async () => { serving = "candidate"; return inspect(); }),
    rollback: vi.fn(async () => { serving = "previous"; return inspect(); }),
  };
  const check = vi.fn(async (_phase: string, _origin: string) => {});
  const transition = vi.fn(async (_action: string) => true);
  const options = { controller, check, transition, currentHead: vi.fn(async () => {}), release: {}, appliedSha: next.sha };
  return { controller, check, transition, options, setServing: (state: string) => { serving = state; } };
}
describe("protected release operation", () => {
  it("checks the old app on expanded schema and staged immutable build before a single promotion", async () => {
    const { options, check, transition, controller } = fixture();
    await executeRelease("promote", options);
    expect(check.mock.calls.map(c => c[0])).toEqual(["previous", "staged", "canonical"]);
    expect(transition.mock.calls.map(c => c[0])).toEqual(["prepare", "start_promote", "promoted"]);
    expect(controller.promote).toHaveBeenCalledOnce();
  });
  it("rejects an unapplied revision and any mismatched observation before switching", async () => {
    const { options, controller, check } = fixture();
    await expect(executeRelease("promote", { ...options, appliedSha: old.sha })).rejects.toThrow();
    check.mockRejectedValueOnce(new Error("old app incompatible"));
    await expect(executeRelease("promote", options)).rejects.toThrow();
    expect(controller.promote).not.toHaveBeenCalled();
  });
  it("does not repeat an ambiguous provider mutation", async () => {
    const { options, transition, controller } = fixture();
    transition.mockImplementation(async action => action !== "start_promote");
    await expect(executeRelease("promote", options)).rejects.toThrow();
    expect(controller.promote).not.toHaveBeenCalled();
  });
  it("reconciles a completed switch after a lost response using the same identities", async () => {
    const { options, controller, transition, setServing } = fixture();
    setServing("candidate");
    await executeRelease("promote", options);
    expect(controller.promote).not.toHaveBeenCalled();
    expect(transition.mock.calls.map(c => c[0])).toEqual(["promoted"]);
  });
  it("checks the retained artifact, switches back once, then checks both public domains", async () => {
    const { options, controller, transition, setServing, check } = fixture();
    setServing("candidate");
    await executeRelease("rollback", options);
    expect(controller.rollback).toHaveBeenCalledOnce();
    expect(transition.mock.calls.map(c => c[0])).toEqual(["start_rollback", "rolled_back"]);
    expect(check.mock.calls.map(c => c[0])).toEqual(["previous", "previous"]);
    expect(check.mock.calls.at(-1)?.[1]).toBe("https://www.helixskin.us");
  });
});

it("can withdraw an unattempted candidate only while both public aliases are back on the old build", async () => {
  const { options, setServing, transition } = fixture();
  const controller = { ...options.controller, inspect: vi.fn(async () => { throw new Error("candidate error"); }) };
  await executeRelease("cancel", { ...options, controller });
  expect(transition.mock.calls).toEqual([["cancel"]]);
  setServing("candidate");
  await expect(executeRelease("cancel", options)).rejects.toThrow();
  expect(transition).toHaveBeenCalledOnce();
});

it("releases a failed promotion only after an exact terminal provider result with old ownership", async () => {
  const { controller, options, transition } = fixture();
  controller.confirmedFailedPromotion.mockResolvedValue(true);
  await executeRelease("rollback", options);
  expect(transition.mock.calls).toEqual([["failed_promotion"]]);
  expect(controller.rollback).not.toHaveBeenCalled();
});

it("uses one independently verified terminal rollback request for a bounded retry", async () => {
  const { options, controller, transition, setServing } = fixture();
  const failed = { requestedAt: 1000, candidateId: next.id, previousId: old.id };
  const retryController = { ...controller, terminalFailedRollback: vi.fn(async () => failed) };
  setServing("candidate");
  await executeRelease("rollback", { ...options, controller: retryController });
  expect(transition.mock.calls[0]).toEqual(["retry_rollback", failed.requestedAt]);
  expect(controller.rollback).toHaveBeenCalledWith(options.release, failed);
});


it("finishes rollback after a failed outgoing build acquires an alias error", async () => {
  const { options, controller, transition, setServing } = fixture();
  setServing("candidate");
  const recoveryController = {
    ...controller,
    inspect: vi.fn(async () => { throw new Error("outgoing alias error"); }),
  };
  await executeRelease("rollback", { ...options, controller: recoveryController });
  expect(recoveryController.inspect).not.toHaveBeenCalled();
  expect(transition.mock.calls).toEqual([["start_rollback"], ["rolled_back"]]);
});
