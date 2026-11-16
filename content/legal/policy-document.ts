import type { ReactNode } from "react";

export type PolicyDocument = {
  title: string;
  metadataTitle: string;
  description: string;
  canonical: string;
  variant: "document" | "accessibility";
  content: ReactNode;
};
