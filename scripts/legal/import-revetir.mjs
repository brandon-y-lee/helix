// Reproduce the authorized local copy from the retained, rendered source articles.
// This tool is offline: it never publishes policy or fetches mutable sources.
import fs from "node:fs";
import crypto from "node:crypto";
import { JSDOM, VirtualConsole } from "jsdom";

const root = new URL("../../", import.meta.url);
const evidence = new URL("docs/evidence/legal-revetir-2026-10-20/", root);
const pages = [
  { source: "privacy-policy", file: "privacy", name: "privacyPolicy", title: "Privacy Policy", route: "/privacy", description: "Privacy Policy for Helix Labs LLC and the Helix website." },
  { source: "terms-conditions", file: "terms", name: "termsOfService", title: "Terms & Conditions", route: "/terms", description: "Terms and Conditions for the Helix website and services, published by Helix Labs LLC." },
  { source: "accessibility", file: "accessibility", name: "accessibilityStatement", title: "Accessibility", route: "/accessibility", description: "Helix's accessibility commitment and how to report accessibility barriers." },
];
const substitutions = [
  ["REVETIR LLC", "Helix Labs LLC"],
  ["REVETIR", "Helix"],
  ["Revetir", "Helix"],
  ["care@revetir.com", "support@helixskin.com"],
  ["2 Park Avenue, 20th Floor, New York, NY 10016", "2747 Haste Street, Berkeley CA 94704"],
  ["https://www.revetir.com", "https://helixskin.vercel.app"],
];
const links = {
  "/us/customer-care/shipping-policy": "/faq#shipping",
  "/us/customer-care/shipping-policy#duties-taxes": "/faq#shipping",
  "/us/customer-care/return-policy": "/faq#returns",
  "/us/guest/self-serve": "/contact",
  "/us/customer-care/contact-us": "/contact",
  "/us/customer-care": "/contact",
  "/us/privacy-policy": "/privacy",
  "/us/terms-conditions": "/terms",
  "/us/cookie-policy": "/cookie-policy",
};
const substitute = (text) => substitutions.reduce((value, [before, after]) => value.replaceAll(before, after), text);
const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;").replaceAll("{", "&#123;").replaceAll("}", "&#125;");
const allowedTags = new Set(["div", "header", "nav", "section", "h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "strong", "em", "a", "span", "br"]);
const reports = [];
const approvedCorrections = JSON.parse(fs.readFileSync(new URL("approved-factual-corrections.json", import.meta.url), "utf8"));

for (const page of pages) {
  const sourceFile = new URL(`source/${page.source}.rendered.article.html`, evidence);
  const source = fs.readFileSync(sourceFile, "utf8");
  const document = new JSDOM(source, { virtualConsole: new VirtualConsole() }).window.document;
  const container = document.querySelector("main") ?? document.body;
  const sourceText = container.textContent;
  const sourceLinks = [...container.querySelectorAll("a")].map((a) => ({ text: a.textContent, href: a.getAttribute("href") }));
  for (const a of container.querySelectorAll("a")) {
    const href = a.getAttribute("href");
    if (href?.startsWith("mailto:")) a.setAttribute("href", substitute(href));
    else if (Object.hasOwn(links, href)) a.setAttribute("href", links[href]);
    else throw new Error(`Unmapped source link: ${page.source}: ${href}`);
  }
  let countedText = sourceText;
  const counts = substitutions.map(([before, after]) => {
    const occurrences = countedText.split(before).length - 1;
    countedText = countedText.replaceAll(before, after);
    return { before, after, occurrences };
  }).filter(({ occurrences }) => occurrences);
  const textNodes = [];
  const walker = document.createTreeWalker(container, document.defaultView.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  for (const node of textNodes) node.textContent = substitute(node.textContent);
  const factualCorrections = approvedCorrections[page.source] ?? [];
  for (const correction of factualCorrections) {
    const matches = textNodes.filter((node) => node.textContent.includes(correction.find));
    if (matches.length !== 1 || matches[0].textContent.split(correction.find).length !== 2) {
      throw new Error(`Expected one exact approved correction match: ${page.source}: ${correction.find}`);
    }
    matches[0].textContent = matches[0].textContent.replace(correction.find, correction.replace);
  }
  function jsx(node) {
    if (node.nodeType === 3) return escape(substitute(node.textContent));
    if (node.nodeType !== 1) return "";
    let tag = node.tagName.toLowerCase();
    if (tag === "main" || tag === "body") return [...node.childNodes].map(jsx).join("\n");
    if (!allowedTags.has(tag)) throw new Error(`Unexpected element: ${tag}`);
    const attributes = [];
    for (const name of ["href", "id", "aria-label", "aria-labelledby", "aria-hidden"]) {
      if (node.hasAttribute(name)) attributes.push(`${name}=${JSON.stringify(node.getAttribute(name))}`);
    }
    const classes = node.classList;
    for (const [sourceClass, value] of [["mb-8", "large"], ["mb-4", "normal"], ["mb-3", "small"], ["mb-2", "compact"]]) {
      if (classes.contains(sourceClass)) attributes.push(`data-policy-gap="${value}"`);
    }
    if (classes.contains("text-gray-600")) attributes.push('data-policy-tone="muted"');
    if (classes.contains("text-blue-600")) attributes.push('data-policy-link="email"');
    if (classes.contains("border-t")) attributes.push('data-policy-callout=""');
    if (classes.contains("max-w-[48rem]") && tag !== "header") attributes.push('data-policy-reading=""');
    if (classes.contains("space-y-4")) attributes.push('data-policy-prose=""');
    const open = `<${tag}${attributes.length ? " " + attributes.join(" ") : ""}`;
    if (tag === "br") return `${open} />`;
    const children = [...node.childNodes].map(jsx).join("");
    return `${open}>${children}</${tag}>${["p", "section", "h1", "h2", "h3", "h4", "li", "ul", "header", "nav"].includes(tag) ? "\n" : ""}`;
  }
  const content = jsx(container);
  const output = `// Generated by scripts/legal/import-revetir.mjs from the retained rendered article.\nimport type { PolicyDocument } from "./policy-document";\n\nexport const ${page.name}: PolicyDocument = {\n  title: ${JSON.stringify(page.title)},\n  metadataTitle: ${JSON.stringify(page.title + " | helix")},\n  description: ${JSON.stringify(page.description)},\n  canonical: ${JSON.stringify(page.route)},\n  variant: ${JSON.stringify(page.file === "accessibility" ? "accessibility" : "document")},\n  content: (<>\n${content}\n  </>),\n};\n`;
  fs.writeFileSync(new URL(`content/legal/${page.file}.tsx`, root), output);
  // Retire only the three superseded policy-summary modules.
  const old = new URL(`content/legal/${page.file}.ts`, root);
  if (fs.existsSync(old)) fs.unlinkSync(old);
  reports.push({ route: page.route, sourceUrl: `https://revetir.com/us/${page.file === "accessibility" ? "customer-care/" : ""}${page.source}`, sourceFile: `source/${page.source}.rendered.article.html`, sourceSha256: crypto.createHash("sha256").update(source).digest("hex"), sourceCharacters: sourceText.length, expectedCharacters: container.textContent.length, textSubstitutions: counts, links: sourceLinks.map((link) => ({ ...link, target: link.href.startsWith("mailto:") ? substitute(link.href) : links[link.href] })), factualCorrections });
}
fs.writeFileSync(new URL("substitutions.json", evidence), JSON.stringify({ substitutions, linkMap: links, pages: reports }, null, 2) + "\n");
console.log("Generated local review copies with only recorded identity substitutions and approved factual corrections.");
