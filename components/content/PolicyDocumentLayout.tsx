import type { PolicyDocument } from "@/content/legal/policy-document";
import styles from "./PolicyDocumentLayout.module.css";

export function PolicyDocumentLayout({ document }: { document: PolicyDocument }) {
  return (
    <article
      className={`${styles.policy} ${document.variant === "accessibility" ? styles.accessibility : styles.document}`}
      aria-label={document.title}
    >
      {document.content}
    </article>
  );
}
