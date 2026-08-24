export function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-\(\)\+]/g, "");
  const digits = cleaned.length === 12 && cleaned.startsWith("91") ? cleaned.slice(2) : cleaned;

  if (!/^\d{10}$/.test(digits)) {
    throw new Error(`Invalid phone number: expected 10 digits, got "${raw}"`);
  }

  return digits;
}

export function formatPhoneDisplay(phone: string): string {
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

export function toSyntheticEmail(phone: string): string {
  return `${normalizePhone(phone)}@guards.local`;
}

export function toOpsSyntheticEmail(phone: string): string {
  return `${normalizePhone(phone)}@ops.local`;
}

export function validateFlatNumber(flatNumber: string): string {
  const trimmed = flatNumber.trim();

  if (!trimmed) {
    throw new Error("Flat number is required");
  }

  return trimmed.toUpperCase();
}

export type FlatNumberTemplate = {
  prefix?: string;
  floor_digits: number;
  unit_digits: number;
};

function normalizeTemplatePrefix(prefix: string | undefined): string | undefined {
  if (prefix === undefined) {
    return undefined;
  }

  const normalizedPrefix = prefix.trim();
  return normalizedPrefix.length > 0 ? normalizedPrefix : undefined;
}

export function validateFloorLabels(labels: string[]): string[] {
  const normalizedLabels = labels
    .map((label) => label.trim().toUpperCase())
    .filter((label) => label.length > 0);

  if (normalizedLabels.length === 0) {
    throw new Error("At least one floor label is required");
  }

  const seen = new Set<string>();

  for (const label of normalizedLabels) {
    if (seen.has(label)) {
      throw new Error(`Duplicate floor label: ${label}`);
    }

    seen.add(label);
  }

  return normalizedLabels;
}

export function validateFlatNumberTemplate(template: FlatNumberTemplate): void {
  if (
    !Number.isInteger(template.floor_digits) ||
    template.floor_digits < 1 ||
    template.floor_digits > 4
  ) {
    throw new Error("Floor digits must be an integer between 1 and 4");
  }

  if (
    !Number.isInteger(template.unit_digits) ||
    template.unit_digits < 1 ||
    template.unit_digits > 4
  ) {
    throw new Error("Unit digits must be an integer between 1 and 4");
  }

  const prefix = normalizeTemplatePrefix(template.prefix);

  if (prefix !== undefined && prefix.length > 10) {
    throw new Error("Flat number prefix must be 10 characters or fewer");
  }
}

function sampleToken(digits: number): string {
  return "01".slice(-digits).padStart(digits, "0");
}

export function generateFlatNumberPreview(template: FlatNumberTemplate): string {
  validateFlatNumberTemplate(template);

  const prefix = normalizeTemplatePrefix(template.prefix) ?? "";
  const floorToken = sampleToken(template.floor_digits);
  const unitToken = sampleToken(template.unit_digits);

  return `${prefix}${floorToken}${unitToken}`;
}

export function validateFlatNumberAgainstTemplate(
  flatNumber: string,
  template: FlatNumberTemplate,
): boolean {
  validateFlatNumberTemplate(template);

  const value = flatNumber.trim().toUpperCase();

  if (!value) {
    return false;
  }

  const prefix = normalizeTemplatePrefix(template.prefix)?.toUpperCase();
  const withoutPrefix =
    prefix === undefined ? value : value.startsWith(prefix) ? value.slice(prefix.length) : null;

  if (withoutPrefix === null) {
    return false;
  }

  const expectedLength = template.floor_digits + template.unit_digits;

  if (withoutPrefix.length !== expectedLength) {
    return false;
  }

  const floorToken = withoutPrefix.slice(0, template.floor_digits);
  const unitToken = withoutPrefix.slice(template.floor_digits);

  if (!/^[A-Z0-9]+$/.test(floorToken)) {
    return false;
  }

  if (!/^\d+$/.test(unitToken)) {
    return false;
  }

  return true;
}

/**
 * Validates if a string is a valid Convex document ID format.
 * Convex IDs are base62-encoded strings, typically 16-20 characters.
 * @param id - The ID string to validate
 * @returns true if the ID appears to be a valid Convex ID format
 */
export function isValidConvexId(id: unknown): boolean {
  if (typeof id !== "string") {
    return false;
  }

  // Convex IDs are base62 strings (alphanumeric, case-sensitive)
  // They're typically 16-20 characters long
  return /^[a-zA-Z0-9]{16,}$/.test(id);
}
