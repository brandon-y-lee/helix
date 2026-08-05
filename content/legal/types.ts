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

