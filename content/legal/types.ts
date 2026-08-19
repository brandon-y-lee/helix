type LegalSection = {
  id: string;
  title: string;
  body: string[];
  list?: string[];
};

export type LegalDocument = {
  title: string;
  metadataTitle: string;
  description: string;
  canonical: string;
  status: string;
  intro: string;
  sections: LegalSection[];
};

export const legalPublicationStatus = {
  operative: false,
  label: "Not in effect",
  summary: "helix is the brand, not a legal person or entity.",
  detail:
    "No Legal Operator or verified legal contact details have been configured, so this page provides factual prelaunch information and is not an operative Legal Document.",
} as const;
