import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/content/LegalDocumentLayout";
import { cookieCategories, cookiePolicy } from "@/content/legal/cookies";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: cookiePolicy.metadataTitle,
  description: cookiePolicy.description,
  canonical: cookiePolicy.canonical,
});

export default function CookiePolicyPage() {
  return (
    <LegalDocumentLayout document={cookiePolicy}>
      <div className="legal-table-block">
        <p className="legal-table-cue" id="cookie-table-cue">
          Scroll horizontally to view all cookie details.
        </p>
        <div
          className="legal-table-wrap"
          role="region"
          aria-label="Cookie categories"
          aria-describedby="cookie-table-cue"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
                <th scope="col">Examples</th>
                <th scope="col">Purpose</th>
                <th scope="col">Optional</th>
              </tr>
            </thead>
            <tbody>
              {cookieCategories.map((category) => (
                <tr key={category.category}>
                  <th scope="row">{category.category}</th>
                  <td>{category.active ? "Active" : "Not active"}</td>
                  <td>{category.examples.join("; ")}</td>
                  <td>{category.purpose}</td>
                  <td>{category.optional ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </LegalDocumentLayout>
  );
}
