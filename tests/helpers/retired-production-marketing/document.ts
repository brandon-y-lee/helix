import { createHash } from "node:crypto";
import { PRODUCTION_MARKETING_WORDING, PRODUCTION_MARKETING_WORDING_VERSION } from "@/lib/production-marketing/contract";

type LandingView = "enrollment" | "confirm" | "preferences";

const style = `*{box-sizing:border-box}body{margin:0;background:#f8f7f4;color:#242523;font:16px/1.6 Manrope,Arial,sans-serif}main{width:min(100% - 40px,600px);margin:64px auto}.wordmark{font:28px Georgia,serif;letter-spacing:.16em}h1{font:normal clamp(32px,6vw,46px)/1.15 Marcellus,Georgia,serif;margin:48px 0 24px}p{margin:20px 0}fieldset{border:0;margin:24px 0;padding:0}label{display:block}input[type=email]{display:block;width:100%;padding:14px;margin:8px 0 24px;border:1px solid #767773;background:transparent;border-radius:0;font:inherit}input[type=checkbox]{width:20px;height:20px;flex-shrink:0;margin:3px 0;accent-color:#242523}.choice{display:flex;gap:12px}button{padding:14px 22px;border:1px solid #242523;background:#242523;color:white;font:inherit;cursor:pointer}button:disabled{opacity:.55;cursor:default}:focus-visible{outline:3px solid #4b6851;outline-offset:4px}a{color:inherit;text-underline-offset:4px}.detail{font-size:13px}#feedback{min-height:28px}#feedback:empty{margin:0}[role=alert]{color:#8c2424}@media(max-width:480px){main{margin:32px auto}h1{margin-top:36px}button{width:100%}}`;

function script(view: LandingView, enabled: boolean): string {
  // Only build-time values enter this script. Capabilities remain in the closure,
  // never in server-rendered HTML, a DOM attribute, cookies or browser storage.
  return `(() => {
  "use strict";
  const view = ${JSON.stringify(view)};
  const enabled = ${JSON.stringify(enabled)};
  const form = document.getElementById("marketing-form");
  const button = document.getElementById("submit");
  const feedback = document.getElementById("feedback");
  let token = "";
  let busy = false;
  let completed = false;
  let request;
  let generation = 0;
  const inform = (message, error = false, focus = false) => {
    feedback.setAttribute("role", error ? "alert" : "status");
    feedback.textContent = message;
    if (focus) feedback.focus();
  };
  const actionable = () => view === "enrollment" ? enabled : Boolean(token) && (view === "preferences" || enabled);
  const update = () => { button.disabled = busy || completed || !actionable(); };
  const readLink = () => {
    generation += 1;
    if (request) request.abort();
    busy = false;
    completed = false;
    const values = new URLSearchParams(location.hash.slice(1));
    const candidate = values.get("token") || "";
    token = values.size === 1 && /^[A-Za-z0-9_-]{43}$/.test(candidate) ? candidate : "";
    // Strip both fragment and unsupported query parameters without a new request.
    history.replaceState(null, "", location.pathname);
    inform("");
    if (view !== "enrollment" && !token) inform("This email link is invalid or has expired. Reopen the original link from your email.", true);
    update();
  };
  readLink();
  addEventListener("hashchange", readLink);
  addEventListener("pagehide", () => { generation += 1; token = ""; if (request) request.abort(); });
  addEventListener("pageshow", (event) => { if (event.persisted) readLink(); });
  form.addEventListener("input", () => { if (!busy && !completed) inform(""); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || completed || !actionable()) return;
    const email = document.getElementById("email");
    const consent = document.getElementById("consent");
    if (view === "enrollment" && (!consent.checked || !email.checkValidity())) {
      form.reportValidity();
      return;
    }
    const body = view === "enrollment" ? { email: email.value, consent: true } : { token };
    const endpoint = view === "enrollment" ? "subscription" : view;
    const current = generation;
    busy = true;
    request = new AbortController();
    update();
    inform("Submitting…");
    try {
      const response = await fetch("/api/marketing/production/" + endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer",
        body: JSON.stringify(body), signal: request.signal
      });
      const result = await response.json();
      if (current !== generation) return;
      if (!response.ok || result.ok !== true) {
        inform(view !== "enrollment" && response.status === 400 ? "This email link is invalid or has expired. Reopen the original link from your email." : "Email preferences are temporarily unavailable. Please try again.", true, true);
        return;
      }
      completed = true;
      token = "";
      if (view === "enrollment") {
        form.reset();
        inform("If this address is eligible, a confirmation request is held for processing. No email delivery is promised.", false, true);
      } else if (view === "confirm") {
        inform("Your welcome email consent is confirmed. Existing email opt-outs still apply. No email delivery is promised.", false, true);
      } else {
        inform("If this link is valid, your marketing withdrawal has been recorded. A welcome email already in progress may still arrive. Order, account, and support emails are unaffected.", false, true);
      }
    } catch {
      if (current === generation) inform("Email preferences are temporarily unavailable. Please try again.", true, true);
    } finally {
      if (current === generation) { busy = false; update(); }
    }
  });
})();`;
}

const hash = (value: string) => `'sha256-${createHash("sha256").update(value).digest("base64")}'`;

/** A standalone route response intentionally bypassing the storefront shell. */
export function productionMarketingLanding(view: LandingView, enabled = false, method: "GET" | "HEAD" = "GET"): Response {
  const enrollment = view === "enrollment";
  const confirmation = view === "confirm";
  const title = enrollment ? "Welcome emails" : confirmation ? "Confirm your email choice" : "Your email preferences";
  const introduction = enrollment
    ? "Choose whether to receive Helix welcome emails. Marketing permission is separate from an account or purchase."
    : confirmation
      ? "Opening this page does not confirm anything. Choose Confirm subscription to confirm welcome-only email consent."
      : "You can withdraw marketing consent without signing in, even while new enrollment is paused. A welcome email already in progress may still arrive. Order, account, and support emails are unaffected.";
  const paused = !enabled && view !== "preferences" ? `<p>New email enrollment is paused. ${confirmation ? "Confirmation is also paused." : "No confirmation request can be submitted here."}</p>` : "";
  const fields = enrollment ? `<fieldset ${enabled ? "" : "disabled"}><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" maxlength="254" required><label class="choice" for="consent"><input id="consent" name="consent" type="checkbox" required><span>${PRODUCTION_MARKETING_WORDING}</span></label><p class="detail">Consent wording: ${PRODUCTION_MARKETING_WORDING_VERSION}</p></fieldset>` : "";
  const js = script(view, enabled);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><title>${title} | Helix</title><style>${style}</style></head><body><main><div class="wordmark">HELIX</div><h1>${title}</h1><p>${introduction}</p>${paused}${confirmation ? `<p>${PRODUCTION_MARKETING_WORDING}</p><p class="detail">Consent wording: ${PRODUCTION_MARKETING_WORDING_VERSION}</p>` : ""}<form id="marketing-form">${fields}<button id="submit" type="submit" disabled>${enrollment ? "Request confirmation" : confirmation ? "Confirm subscription" : "Unsubscribe from marketing"}</button></form><p id="feedback" role="status" aria-live="polite" tabindex="-1"></p><noscript><p>JavaScript is required to submit this choice. Opening this page does not change your consent.</p></noscript>${!enrollment ? "<p class=\"detail\">If you reload this page, reopen the original link from your email.</p>" : ""}<p class="detail"><a href="/privacy" rel="noreferrer">Privacy Policy</a></p></main><script>${js}</script></body></html>`;
  return new Response(method === "HEAD" ? null : html, { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": `default-src 'none'; script-src ${hash(js)}; style-src ${hash(style)}; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'`,
  } });
}
