import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/content/LegalDocumentLayout";
import { cookieCategories, cookiePolicy } from "@/content/legal/cookies";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: cookiePolicy.metadataTitle,
  description: cookiePolicy.description,
  alternates: { canonical: cookiePolicy.canonical },
  openGraph: {
    title: cookiePolicy.metadataTitle,
    description: cookiePolicy.description,
    url: cookiePolicy.canonical,
    siteName: "Mei Pelle",
    type: "website",
  },
};

export default function CookiePolicyPage() {
  return (
    <LegalDocumentLayout document={cookiePolicy}>
      <div className="legal-table-wrap" aria-label="Cookie categories">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Status</th>
              <th>Examples</th>
              <th>Purpose</th>
              <th>Optional</th>
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
    </LegalDocumentLayout>
  );
}

