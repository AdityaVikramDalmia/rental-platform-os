import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const ALLOWED_PDF_CONTENT_TYPES = new Set(["application/pdf"]);

export const ALLOWED_IMAGE_OR_PDF_CONTENT_TYPES = new Set([
  ...ALLOWED_IMAGE_CONTENT_TYPES,
  ...ALLOWED_PDF_CONTENT_TYPES,
]);

type StorageValidationCtx = Pick<MutationCtx, "db">;

type ValidateStoredFileOptions = {
  fieldName: string;
  allowedContentTypes: ReadonlySet<string>;
  allowedLabel: string;
  maxSizeBytes?: number;
};

export async function validateStoredFile(
  ctx: StorageValidationCtx,
  storageId: Id<"_storage">,
  options: ValidateStoredFileOptions,
): Promise<void> {
  const metadata = await ctx.db.system.get("_storage", storageId);

  if (!metadata) {
    throw new Error(`${options.fieldName}: file not found in storage`);
  }

  const contentType = metadata.contentType ?? "";
  if (!options.allowedContentTypes.has(contentType)) {
    throw new Error(`${options.fieldName}: only ${options.allowedLabel} files are allowed`);
  }

  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_UPLOAD_SIZE_BYTES;
  if (metadata.size > maxSizeBytes) {
    throw new Error(`${options.fieldName}: file too large. Maximum size is 10MB`);
  }
}

export async function validateOptionalStoredFile(
  ctx: StorageValidationCtx,
  storageId: Id<"_storage"> | undefined,
  options: ValidateStoredFileOptions,
): Promise<void> {
  if (storageId === undefined) {
    return;
  }

  await validateStoredFile(ctx, storageId, options);
}
