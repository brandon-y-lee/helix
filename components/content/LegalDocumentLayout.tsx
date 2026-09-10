import type { ReactNode } from "react";
import {
  legalPublicationStatus,
  type LegalDocument,
} from "@/content/legal/types";

function SectionLinks({ document }: { document: LegalDocument }) {
  return (
    <ol>
      {document.sections.map((section) => (
        <li key={section.id}>
          <a href={`#${section.id}`}>{section.title}</a>
        </li>
      ))}
    </ol>
  );
}

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
        <nav
          className="legal-toc legal-toc--desktop"
          aria-label={`${document.title} sections`}
        >
          <h2>Contents</h2>
          <SectionLinks document={document} />
        </nav>
        <details className="legal-toc legal-toc--mobile">
          <summary>Contents</summary>
          <nav aria-label={`${document.title} sections`}>
            <SectionLinks document={document} />
          </nav>
        </details>

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
