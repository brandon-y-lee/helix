import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { productionMarketingLanding } from "@/tests/helpers/retired-production-marketing/document";

function load(view: "enrollment" | "confirm" | "preferences", enabled = false, fragment = "") {
  const response = productionMarketingLanding(view, enabled);
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  return response.text().then((html) => {
    window.history.replaceState(null, "", `/marketing/production/${view === "enrollment" ? "" : view}${fragment}`);
    document.documentElement.innerHTML = html;
    vi.stubGlobal("fetch", fetch);
    new Function(document.querySelector("script")!.textContent!)();
    const dom = { window };
    return { dom, document: dom.window.document, fetch, response, html };
  });
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("isolated production marketing landing", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("starts with explicit unchecked consent and disabled enrollment, not sandbox claims", async () => {
    const { dom, document, fetch } = await load("enrollment");
    expect(document.querySelector<HTMLInputElement>("[type=checkbox]")?.checked).toBe(false);
    expect(document.querySelector("fieldset")?.disabled).toBe(true);
    expect(document.querySelector("button")?.disabled).toBe(true);
    expect(document.body.textContent).toContain("New email enrollment is paused");
    expect(document.body.textContent).not.toMatch(/discount|check your inbox|email has been sent/i);
    document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires explicit welcome-only consent and reports a held request, not sent mail", async () => {
    const { dom, document, fetch } = await load("enrollment", true);
    const form = document.querySelector("form")!;
    document.querySelector<HTMLInputElement>("[type=email]")!.value = "synthetic@example.test";
    form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    expect(fetch).not.toHaveBeenCalled();
    document.querySelector<HTMLInputElement>("[type=checkbox]")!.checked = true;
    form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    await settle();
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/marketing/production/subscription", expect.objectContaining({
      method: "POST", referrerPolicy: "no-referrer", body: JSON.stringify({email:"synthetic@example.test",consent:true}),
    }));
    expect(document.querySelector("[role=status]")?.textContent).toContain("held");
    expect(document.body.textContent).not.toMatch(/check your inbox|email has been sent/i);
  });

  it("strips the fragment, stays scanner-safe and confirms only on an explicit action", async () => {
    const { dom, document, fetch, html } = await load("confirm", true, "#token=ccccccccccccccccccccccccccccccccccccccccccc");
    expect(dom.window.location.hash).toBe("");
    expect(html).not.toContain("ccccccccccccccccccccccccccccccccccccccccccc");
    expect(document.body.textContent).not.toContain("ccccccccccccccccccccccccccccccccccccccccccc");
    expect(fetch).not.toHaveBeenCalled();
    const form = document.querySelector("form")!;
    form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    await settle();
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/marketing/production/confirm", expect.objectContaining({method:"POST",body:JSON.stringify({token:"ccccccccccccccccccccccccccccccccccccccccccc"})}));
    expect(document.activeElement).toBe(document.querySelector("[role=status]"));
    expect(document.querySelector("button")?.disabled).toBe(true);
    expect(dom.window.localStorage.length).toBe(0);
    expect(dom.window.sessionStorage.length).toBe(0);
  });

  it("pauses confirmation but allows no-login withdrawal while enrollment is paused", async () => {
    const confirm = await load("confirm", false, "#token=ccccccccccccccccccccccccccccccccccccccccccc");
    expect(confirm.document.querySelector("button")?.disabled).toBe(true);
    expect(confirm.fetch).not.toHaveBeenCalled();
    const { dom, document, fetch } = await load("preferences", false, "#token=uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu");
    expect(document.querySelector("button")?.disabled).toBe(false);
    expect(document.querySelector("[type=email]")).toBeNull();
    expect(document.body.textContent).toContain("Order, account, and support emails are unaffected");
    document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", {cancelable:true}));
    await settle();
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/marketing/production/preferences",expect.objectContaining({method:"POST",body:JSON.stringify({token:"uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu"})}));
    expect(document.querySelector("[role=status]")?.textContent).toContain("withdrawal");
  });

  it("does not echo private server errors or accept query/ambiguous capabilities", async () => {
    const { dom, document, fetch } = await load("preferences", false, "#token=uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu");
    fetch.mockResolvedValueOnce({ok:false,status:503,json:async()=>({error:"private-address-and-token"})});
    document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit",{cancelable:true}));
    await settle();
    expect(document.querySelector("[role=alert]")?.textContent).toContain("temporarily unavailable");
    expect(document.body.textContent).not.toContain("private-address-and-token");
    expect(document.querySelector("button")?.disabled).toBe(false);
    const invalid = await load("confirm", true, "?token=query-secret#token=first&token=second");
    expect(invalid.dom.window.location.search).toBe("");
    expect(invalid.document.querySelector("button")?.disabled).toBe(true);
    expect(invalid.fetch).not.toHaveBeenCalled();
  });

  it("isolates every landing with no-store/no-referrer/hash CSP and no external resources", async () => {
    for (const view of ["enrollment", "confirm", "preferences"] as const) {
      const { document, response, html } = await load(view);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(document.querySelectorAll("[src],link,iframe,img")).toHaveLength(0);
      const csp = response.headers.get("Content-Security-Policy")!;
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      for (const node of document.querySelectorAll("script,style")) {
        expect(csp).toContain(`'sha256-${createHash("sha256").update(node.textContent!).digest("base64")}'`);
      }
      expect(html).not.toMatch(/https?:\/\/|localStorage|sessionStorage|console\./);
      const head = productionMarketingLanding(view, false, "HEAD");
      expect(await head.text()).toBe("");
      expect(head.headers.get("Content-Security-Policy")).toBe(csp);
    }
  });
});
