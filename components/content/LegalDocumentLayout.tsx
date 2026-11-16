import type { ReactNode } from "react";
import { LegalContents } from "@/components/content/LegalContents";
import {
  legalPublicationStatus,
  type LegalDocument,
} from "@/content/legal/types";

export function LegalDocumentLayout({
  document,
  children,
}: {
  document: LegalDocument;
  children?: ReactNode;
}) {
  return (
    <article className="legal-page">
      <header className="legal-hero">
        <p className="eyebrow">{legalPublicationStatus.label}</p>
        <h1>{document.title}</h1>
        <p>{document.intro}</p>
        <p>{legalPublicationStatus.summary}</p>
        <p>{legalPublicationStatus.detail}</p>
        <span>{document.status}</span>
      </header>

      <div className="legal-shell">
        <LegalContents
          title={document.title}
          sections={document.sections.map(({ id, title }) => ({ id, title }))}
        />

        <div className="legal-document">
          {children}
          {document.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.list && (
                <ul>
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
