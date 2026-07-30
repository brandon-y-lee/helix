import { createInterface } from "node:readline/promises";
import {
  getCatalogFieldOwnership,
  type CatalogFieldOwner,
} from "../../lib/catalog/field-ownership";

export type CatalogRow = Record<string, unknown>;

export type CatalogProductWritePlan = {
  slug: string;
  existingId: string | null;
  insert: CatalogRow | null;
  update: CatalogRow;
  sourceOwnedFieldsUpdated: string[];
  commerceFieldsUpdated: string[];
  editorialFieldsSeeded: string[];
  editorialFieldsSkipped: string[];
  editorialFieldsToOverwrite: string[];
};

export type EditorialOverwriteTarget = {
  slug: string;
  fields: readonly string[];
  mediaRows?: number;
};

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPopulated(value: unknown): boolean {
  return value !== null && value !== undefined;
}

function changedFields(
  existing: CatalogRow,
  desired: CatalogRow,
): string[] {
  return Object.keys(desired).filter(
    (field) => !valuesEqual(existing[field], desired[field]),
  );
}

function changedValues(
  existing: CatalogRow,
  desired: CatalogRow,
  fields: readonly string[],
): CatalogRow {
  return Object.fromEntries(fields.map((field) => [field, desired[field]]));
}

export function assertCatalogInputFields(
  table: string,
  fields: readonly string[],
  allowedOwners: readonly CatalogFieldOwner[],
): void {
  for (const field of fields) {
    const ownership = getCatalogFieldOwnership(table, field);
    if (!ownership) {
      throw new Error(
        `[catalog-writer] Field ownership is undefined for ${table}.${field}.`,
      );
    }
    if (
      ownership.owner === "derived" ||
      !allowedOwners.includes(ownership.owner)
    ) {
      throw new Error(
        `[catalog-writer] ${table}.${field} is ${ownership.owner}-owned and cannot be used by this writer.`,
      );
    }
  }
}

export function planSupplierProductWrite({
  slug,
  existing,
  insert,
  source,
  commerce,
  editorial,
  overwriteEditorial,
}: {
  slug: string;
  existing: (CatalogRow & { id: string }) | null;
  insert: CatalogRow;
  source: CatalogRow;
  commerce: CatalogRow;
  editorial: CatalogRow;
  overwriteEditorial: boolean;
}): CatalogProductWritePlan {
  assertCatalogInputFields("products", Object.keys(source), ["supplier"]);
  assertCatalogInputFields("products", Object.keys(commerce), ["commerce"]);
  assertCatalogInputFields("products", Object.keys(editorial), ["editorial"]);
  assertCatalogInputFields("products", Object.keys(insert), [
    "supplier",
    "commerce",
    "system",
    "editorial",
  ]);

  if (!existing) {
    return {
      slug,
      existingId: null,
      insert,
      update: {},
      sourceOwnedFieldsUpdated: Object.keys(source),
      commerceFieldsUpdated: Object.keys(commerce),
      editorialFieldsSeeded: Object.keys(editorial),
      editorialFieldsSkipped: [],
      editorialFieldsToOverwrite: [],
    };
  }

  const sourceOwnedFieldsUpdated = changedFields(existing, source);
  const commerceFieldsUpdated = changedFields(existing, commerce);
  const changedEditorialFields = changedFields(existing, editorial);
  const editorialFieldsToOverwrite = overwriteEditorial
    ? changedEditorialFields.filter((field) => isPopulated(existing[field]))
    : [];
  const editorialFieldsSeeded = overwriteEditorial
    ? changedEditorialFields.filter((field) => !isPopulated(existing[field]))
    : [];
  const editorialFieldsSkipped = overwriteEditorial
    ? []
    : changedEditorialFields;

  return {
    slug,
    existingId: existing.id,
    insert: null,
    update: {
      ...changedValues(existing, source, sourceOwnedFieldsUpdated),
      ...changedValues(existing, commerce, commerceFieldsUpdated),
      ...(overwriteEditorial
        ? changedValues(existing, editorial, changedEditorialFields)
        : {}),
    },
    sourceOwnedFieldsUpdated,
    commerceFieldsUpdated,
    editorialFieldsSeeded,
    editorialFieldsSkipped,
    editorialFieldsToOverwrite,
  };
}

export function planPresentationProductWrite({
  slug,
  existing,
  editorial,
  overwriteEditorial,
}: {
  slug: string;
  existing: CatalogRow & { id: string };
  editorial: CatalogRow;
  overwriteEditorial: boolean;
}): CatalogProductWritePlan {
  assertCatalogInputFields("products", Object.keys(editorial), ["editorial"]);
  const changedEditorialFields = changedFields(existing, editorial);
  const editorialFieldsSeeded = changedEditorialFields.filter(
    (field) => !isPopulated(existing[field]),
  );
  const editorialFieldsToOverwrite = overwriteEditorial
    ? changedEditorialFields.filter((field) => isPopulated(existing[field]))
    : [];
  const editorialFieldsSkipped = overwriteEditorial
    ? []
    : changedEditorialFields.filter((field) => isPopulated(existing[field]));
  const writableFields = overwriteEditorial
    ? changedEditorialFields
    : editorialFieldsSeeded;

  return {
    slug,
    existingId: existing.id,
    insert: null,
    update: changedValues(existing, editorial, writableFields),
    sourceOwnedFieldsUpdated: [],
    commerceFieldsUpdated: [],
    editorialFieldsSeeded,
    editorialFieldsSkipped,
    editorialFieldsToOverwrite,
  };
}

export async function executeCatalogProductWritePlans({
  apply,
  plans,
  insert,
  update,
}: {
  apply: boolean;
  plans: readonly CatalogProductWritePlan[];
  insert: (row: CatalogRow) => Promise<void>;
  update: (id: string, row: CatalogRow) => Promise<void>;
}): Promise<{ inserted: number; updated: number }> {
  if (!apply) return { inserted: 0, updated: 0 };

  let inserted = 0;
  let updated = 0;
  for (const plan of plans) {
    if (plan.insert) {
      await insert(plan.insert);
      inserted += 1;
      continue;
    }
    if (plan.existingId && Object.keys(plan.update).length > 0) {
      await update(plan.existingId, plan.update);
      updated += 1;
    }
  }
  return { inserted, updated };
}

export function overwriteConfirmationMode({
  apply,
  overwriteEditorial,
  hasOverwriteTargets,
  interactive,
  confirmedNonInteractive,
}: {
  apply: boolean;
  overwriteEditorial: boolean;
  hasOverwriteTargets: boolean;
  interactive: boolean;
  confirmedNonInteractive: boolean;
}): "none" | "prompt" | "confirmed-non-interactive" {
  if (!apply || !overwriteEditorial || !hasOverwriteTargets) return "none";
  if (interactive) return "prompt";
  if (confirmedNonInteractive) return "confirmed-non-interactive";
  throw new Error(
    "Non-interactive editorial overwrite requires --confirm-editorial-overwrite in addition to --overwrite-editorial.",
  );
}

export async function requireEditorialOverwriteConfirmation({
  apply,
  overwriteEditorial,
  confirmedNonInteractive,
  targets,
}: {
  apply: boolean;
  overwriteEditorial: boolean;
  confirmedNonInteractive: boolean;
  targets: readonly EditorialOverwriteTarget[];
}): Promise<void> {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const mode = overwriteConfirmationMode({
    apply,
    overwriteEditorial,
    hasOverwriteTargets: targets.length > 0,
    interactive,
    confirmedNonInteractive,
  });
  if (mode === "none") return;

  console.error(
    "[catalog-writer] WARNING: this operation will overwrite editor-owned published catalog fields.",
  );
  for (const target of targets) {
    const media = target.mediaRows
      ? `; product_media rows: ${target.mediaRows}`
      : "";
    console.error(
      `[catalog-writer] ${target.slug}: ${target.fields.join(", ") || "<media only>"}${media}`,
    );
  }

  if (mode === "confirmed-non-interactive") return;

  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await prompt.question(
      'Type "OVERWRITE EDITORIAL" to continue: ',
    );
    if (answer !== "OVERWRITE EDITORIAL") {
      throw new Error("Editorial overwrite cancelled.");
    }
  } finally {
    prompt.close();
  }
}
