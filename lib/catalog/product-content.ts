export type PdpProfileTitleToken = {
  text: string;
  emphasis?: boolean;
};

export type PdpIngredientCard = {
  name: string;
  label: string;
  copy: string;
};

export type PdpIngredientHighlight = {
  name: string;
  description: string;
};

export type PdpIngredientStory = {
  heading: string;
  intro: string;
  highlights: readonly [
    PdpIngredientHighlight,
    PdpIngredientHighlight,
  ];
  supportingIngredients: string;
};

export type ProductPdpContent = {
  schemaVersion: 1;
  profileTitleTokens: PdpProfileTitleToken[] | null;
  routineOverlay: string | null;
  outcomeHeading: string | null;
  outcomeLabels: [string, string, string] | null;
  howToUseSteps: string[] | null;
  applicationSteps: string[] | null;
  ingredientCards: PdpIngredientCard[] | null;
  ingredientStory: PdpIngredientStory | null;
  routineGuidance: string | null;
};

export type HowToUseStepResolution = {
  steps: string[];
  source:
    | "product_pdp_content.how_to_use_steps"
    | "products.editorial_how_to_use";
  usedParagraphFallback: boolean;
};

export function resolveHowToUseSteps(
  structuredSteps: readonly string[] | null | undefined,
  paragraph: string,
): HowToUseStepResolution {
  if (structuredSteps !== null && structuredSteps !== undefined) {
    return {
      steps: [...structuredSteps],
      source: "product_pdp_content.how_to_use_steps",
      usedParagraphFallback: false,
    };
  }

  return {
    steps: paragraph
      .split(/[.;]\s+/)
      .map((item) => item.trim().replace(/[.;]$/, ""))
      .filter(Boolean),
    source: "products.editorial_how_to_use",
    usedParagraphFallback: true,
  };
}

type ProductPdpContentDatabaseRow =
  Database["public"]["Tables"]["product_pdp_content"]["Row"];

export type ProductPdpContentRow = Pick<
  ProductPdpContentDatabaseRow,
  | "schema_version"
  | "profile_title_tokens"
  | "routine_overlay"
  | "outcome_heading"
  | "outcome_labels"
  | "how_to_use_steps"
  | "application_steps"
  | "ingredient_cards"
  | "ingredient_story"
  | "routine_guidance"
>;

function invalid(slug: string, field: string): never {
  throw new Error(
    `[catalog] Invalid PDP content for "${slug}": ${field} has an unsupported shape.`,
  );
}

function nullableText(
  value: unknown,
  slug: string,
  field: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") invalid(slug, field);
  return value;
}

function nullableTextArray(
  value: unknown,
  slug: string,
  field: string,
): string[] | null {
  if (value === null || value === undefined) return null;
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string")
  ) {
    invalid(slug, field);
  }
  return [...value];
}

function profileTitleTokens(
  value: unknown,
  slug: string,
): PdpProfileTitleToken[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) invalid(slug, "profile_title_tokens");

  return value.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as { text?: unknown }).text !== "string" ||
      ("emphasis" in item &&
        typeof (item as { emphasis?: unknown }).emphasis !== "boolean")
    ) {
      invalid(slug, "profile_title_tokens");
    }
    const token = item as { text: string; emphasis?: boolean };
    return token.emphasis
      ? { text: token.text, emphasis: true }
      : { text: token.text };
  });
}

function ingredientCards(
  value: unknown,
  slug: string,
): PdpIngredientCard[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) invalid(slug, "ingredient_cards");

  return value.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as { name?: unknown }).name !== "string" ||
      typeof (item as { label?: unknown }).label !== "string" ||
      typeof (item as { copy?: unknown }).copy !== "string"
    ) {
      invalid(slug, "ingredient_cards");
    }
    const card = item as PdpIngredientCard;
    return { name: card.name, label: card.label, copy: card.copy };
  });
}

function ingredientStory(
  value: unknown,
  slug: string,
): PdpIngredientStory | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object") invalid(slug, "ingredient_story");

  const story = value as {
    heading?: unknown;
    intro?: unknown;
    highlights?: unknown;
    supportingIngredients?: unknown;
  };
  if (
    typeof story.heading !== "string" ||
    typeof story.intro !== "string" ||
    typeof story.supportingIngredients !== "string" ||
    !Array.isArray(story.highlights) ||
    story.highlights.length !== 2
  ) {
    invalid(slug, "ingredient_story");
  }

  const highlights = story.highlights.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as { name?: unknown }).name !== "string" ||
      typeof (item as { description?: unknown }).description !== "string"
    ) {
      invalid(slug, "ingredient_story");
    }
    return {
      name: (item as { name: string }).name,
      description: (item as { description: string }).description,
    };
  }) as [PdpIngredientHighlight, PdpIngredientHighlight];

  return {
    heading: story.heading,
    intro: story.intro,
    highlights,
    supportingIngredients: story.supportingIngredients,
  };
}

export function normalizeProductPdpContent(
  row: ProductPdpContentRow | null | undefined,
  slug: string,
): ProductPdpContent | null {
  if (!row) return null;
  if (row.schema_version !== 1) invalid(slug, "schema_version");

  const outcomeLabels = nullableTextArray(
    row.outcome_labels,
    slug,
    "outcome_labels",
  );
  if (outcomeLabels !== null && outcomeLabels.length !== 3) {
    invalid(slug, "outcome_labels");
  }

  return {
    schemaVersion: 1,
    profileTitleTokens: profileTitleTokens(row.profile_title_tokens, slug),
    routineOverlay: nullableText(row.routine_overlay, slug, "routine_overlay"),
    outcomeHeading: nullableText(row.outcome_heading, slug, "outcome_heading"),
    outcomeLabels: outcomeLabels as [string, string, string] | null,
    howToUseSteps: nullableTextArray(
      row.how_to_use_steps,
      slug,
      "how_to_use_steps",
    ),
    applicationSteps: nullableTextArray(
      row.application_steps,
      slug,
      "application_steps",
    ),
    ingredientCards: ingredientCards(row.ingredient_cards, slug),
    ingredientStory: ingredientStory(row.ingredient_story, slug),
    routineGuidance: nullableText(
      row.routine_guidance,
      slug,
      "routine_guidance",
    ),
  };
}
import type { Database } from "@/lib/database.types";
