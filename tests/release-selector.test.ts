import { describe, expect, it, vi } from "vitest";
import { discover, releaseSelector } from "../scripts/release/command.mjs";

const candidate = { id: "dpl_next", sha: "a".repeat(40), url: "https://next.vercel.app" };
const previous = { id: "dpl_old", sha: "b".repeat(40), url: "https://old.vercel.app" };
function fixture() {
  const source = { mergedSha: vi.fn(async () => candidate.sha), releasePrForCommit: vi.fn(async () => 571),
    verifyPr: vi.fn(async () => {}), assertMainHead: vi.fn(async () => {}) };
  const controller = { candidateForSha: vi.fn(async () => candidate), candidateById: vi.fn(async () => candidate),
    discoverPrevious: vi.fn(async () => previous) };
  return { source, controller, repoId: "1280166759", workflowSha: candidate.sha };
}
describe("single release selector", () => {
  it("derives the same protected release from a PR or an immutable deployment without manual SHA or alias inputs", async () => {
    const deps = fixture();
    const fromPr = await discover({ ...deps, selector: releaseSelector("https://github.com/brandon-y-lee/helix/pull/571") });
    const fromId = await discover({ ...deps, selector: releaseSelector(candidate.id) });
    expect(fromPr).toEqual(fromId);
    expect(fromPr).toEqual({ pr: 571, release: { candidateId: candidate.id, candidateSha: candidate.sha,
      previousId: previous.id, previousSha: previous.sha } });
    expect(deps.source.verifyPr).toHaveBeenCalledWith(571, "merged", candidate.sha, deps.repoId);
  });
  it("refuses foreign PRs, implicit aliases, and a superseded merged commit before previous lookup", async () => {
    for (const bad of ["https://github.com/other/other/pull/571", "main", "https://www.helixskin.us", "1\nfoo"]) {
      expect(() => releaseSelector(bad)).toThrow();
    }
    const deps = fixture();
    await expect(discover({ ...deps, workflowSha: previous.sha, selector: releaseSelector("#571") })).rejects.toThrow();
    expect(deps.controller.discoverPrevious).not.toHaveBeenCalled();
  });
});
