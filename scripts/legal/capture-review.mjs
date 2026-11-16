// Light, local-only browser evidence. Does not build, mutate providers, or run the full E2E suite.
import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const origin = process.env.HELIX_LEGAL_PREVIEW_URL ?? "http://127.0.0.1:3036";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = process.env.HELIX_LEGAL_CAPTURE_DIRECTORY ?? "/tmp/helix-legal-artifacts/implementation";
fs.mkdirSync(out, { recursive: true });
const evidence = new URL("../../docs/evidence/legal-revetir-2026-10-20/", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL("substitutions.json", evidence), "utf8"));
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const context = await browser.newContext({ reducedMotion: "reduce", deviceScaleFactor: 1 });
  for (const policy of manifest.pages) {
    const source = fs.readFileSync(new URL(policy.sourceFile, evidence), "utf8");
    for (const [size, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height });
      const response = await page.goto(origin + policy.route, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200);
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(({ source, substitutions, linkMap, factualCorrections, removedParagraphs }) => {
        const article = document.querySelector("article[aria-label]");
        const original = document.createElement("div");
        original.innerHTML = source;
        const normalized = (text) => text.replace(/\s+/g, " ").trim();
        const substitute = (text) => substitutions.reduce((value, [before, after]) => value.replaceAll(before, after), text);
        for (const text of removedParagraphs) {
          const matches = [...original.querySelectorAll("p")].filter((paragraph) => substitute(normalized(paragraph.textContent)) === normalized(text));
          if (matches.length !== 1) throw new Error(`Expected one approved removed paragraph: ${text}`);
          matches[0].remove();
        }
        const blocks = (root) => [...root.querySelectorAll("h1,h2,h3,h4,p,li")].map((element) => ({ tag: element.tagName, text: normalized(element.textContent) }));
        const actual = blocks(article);
        const expected = blocks(original).map((block) => ({ ...block, text: normalized(factualCorrections.reduce((value, correction) => value.replace(correction.find.trim(), correction.replace.trim()), substitute(block.text))) }));
        const actualLinks = [...article.querySelectorAll("a")].map((a) => ({ text: normalized(a.textContent), href: a.getAttribute("href") }));
        const expectedLinks = [...original.querySelectorAll("a")].map((a) => ({ text: substitute(normalized(a.textContent)), href: a.getAttribute("href").startsWith("mailto:") ? substitute(a.getAttribute("href")) : linkMap[a.getAttribute("href")] }));
        const rect = article.getBoundingClientRect();
        const h1 = article.querySelector("h1");
        const p = article.querySelector("p");
        return {
          contentParity: JSON.stringify(actual) === JSON.stringify(expected),
          linkParity: JSON.stringify(actualLinks) === JSON.stringify(expectedLinks),
          blocks: actual.length,
          headings: article.querySelectorAll("h1,h2,h3,h4").length,
          paragraphs: article.querySelectorAll("p").length,
          listItems: article.querySelectorAll("li").length,
          links: actualLinks,
          viewport: { width: innerWidth, height: innerHeight },
          documentWidth: document.documentElement.scrollWidth,
          article: { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
          h1: { font: getComputedStyle(h1).fontFamily, fontSize: getComputedStyle(h1).fontSize, lineHeight: getComputedStyle(h1).lineHeight, left: h1.getBoundingClientRect().x },
          firstParagraph: { font: getComputedStyle(p).fontFamily, fontSize: getComputedStyle(p).fontSize, lineHeight: getComputedStyle(p).lineHeight },
          hasSummaryNotices: /Not in effect|No Legal Operator|not an operative|prelaunch/i.test(article.textContent),
        };
      }, {
        source, substitutions: manifest.substitutions, linkMap: manifest.linkMap,
        factualCorrections: [...(policy.factualCorrections ?? []), ...(policy.terminologyCorrections ?? []), ...(policy.returnPolicyCorrections ?? []).filter((correction) => correction.operation !== "remove-paragraph")],
        removedParagraphs: (policy.returnPolicyCorrections ?? []).filter((correction) => correction.operation === "remove-paragraph").map((correction) => correction.find),
      });
      assert.equal(result.contentParity, true, `${policy.route} ${size}: content parity`);
      assert.equal(result.linkParity, true, `${policy.route} ${size}: link parity`);
      assert.ok(result.documentWidth <= width, `${policy.route} ${size}: horizontal overflow`);
      assert.equal(result.hasSummaryNotices, false);
      // Omit only Next.js's development-tools badge from deliverable screenshots.
      const screenshotOptions = { animations: "disabled", style: "nextjs-portal { display: none; }" };
      await page.screenshot({ path: `${out}/${policy.route.slice(1)}-${size}-top.png`, ...screenshotOptions });
      await page.screenshot({ path: `${out}/${policy.route.slice(1)}-${size}-full.png`, fullPage: true, ...screenshotOptions });
      const firstLink = page.locator("article[aria-label] a").first();
      await firstLink.focus();
      assert.equal(await firstLink.evaluate((a) => a === document.activeElement), true);
      await page.keyboard.press("Tab");
      assert.deepEqual(errors, [], `${policy.route} ${size}: browser errors`);
      results.push({ route: policy.route, size, status: response.status(), errors, ...result });
      await page.close();
    }
    const page = await context.newPage();
    for (const width of [320, 720, 768, 2560]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(origin + policy.route, { waitUntil: "domcontentloaded" });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${policy.route}: overflow at ${width}px`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(`${out}/browser-results.json`, JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify({ result: "PASS", pages: results.map(({ route, size, status, blocks, headings, paragraphs, listItems, contentParity, linkParity }) => ({ route, size, status, blocks, headings, paragraphs, listItems, contentParity, linkParity })), screenshots: out }, null, 2));
