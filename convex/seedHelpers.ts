// Demo data — all values are fictitious. Generated for development and
// open-source demonstration only.
import { normalizePhone } from "../lib/validators";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const DEMO_EMAILS = {
  founder_one: "admin@example.com",
  agent: "agent@example.com",
  guard1: "9999999999@guards.local",
  guard2: "9876543210@guards.local",
  guard3: "9765432109@guards.local",
  ops1: "8888888888@ops.local",
  ops2: "7777777777@ops.local",
  tenant1: "tenant1@test.demorentals.com",
  tenant2: "tenant2@test.demorentals.com",
  owner1: "owner1@test.demorentals.com",
  owner2: "owner2@test.demorentals.com",
} as const;

export const DEMO_PHONES = {
  guard1: "9999999999",
  guard2: "9876543210",
  guard3: "9765432109",
  ops1: "8888888888",
  ops2: "7777777777",
  tenant1: "9111111111",
  tenant2: "9222222222",
  owner1: "7000000001",
  owner2: "7000000002",
} as const;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC32_POLYNOMIAL = 0xedb88320;
const ADLER_MOD = 65521;
const textEncoder = new TextEncoder();

const FIRST_NAMES = [
  "Aarav",
  "Vihaan",
  "DemoAdmin",
  "Arjun",
  "Ishaan",
  "Kabir",
  "Rohan",
  "Rahul",
  "Neeraj",
  "Vikram",
  "Ananya",
  "Diya",
  "Ira",
  "Kavya",
  "Meera",
  "Nisha",
  "Pooja",
  "Riya",
  "Sanya",
  "Sneha",
  "Tanvi",
  "Aditi",
  "Priya",
  "Simran",
  "Shreya",
  "Aman",
  "Kunal",
  "Yash",
  "Karan",
  "Manav",
] as const;

const LAST_NAMES = [
  "Sharma",
  "Verma",
  "Gupta",
  "Patel",
  "Shah",
  "Singh",
  "Kumar",
  "Mehta",
  "Nair",
  "Iyer",
  "Reddy",
  "Joshi",
  "Kapoor",
  "Malhotra",
  "Bhat",
  "Chopra",
  "Agarwal",
  "Desai",
  "Kulkarni",
  "Sawant",
  "Pillai",
  "Pandey",
  "Tiwari",
  "Mishra",
  "Yadav",
  "Chauhan",
  "Chatterjee",
  "Banerjee",
  "Mukherjee",
  "Das",
] as const;

const MUMBAI_LOCALITIES = [
  "Andheri West",
  "Andheri East",
  "Bandra West",
  "Bandra East",
  "Powai",
  "Goregaon East",
  "Goregaon West",
  "Malad West",
  "Kandivali East",
  "Borivali West",
  "Chembur",
  "Worli",
  "Lower Parel",
  "Dadar",
  "Matunga",
  "Vile Parle",
  "Santacruz",
  "Kurla",
  "Mulund",
  "Thane West",
] as const;

const RENT_OPTIONS_RUPEES = [
  8000, 9500, 11000, 12500, 14000, 16000, 18000, 21000, 24000, 27000, 30000, 33000, 36000, 39000,
  42000, 45000, 48000, 52000, 56000, 60000, 65000, 70000, 75000, 80000, 85000,
] as const;

const FLAT_WINGS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"] as const;
const FLAT_FLOORS = [5, 3, 12, 8, 7, 10, 14, 18, 9, 15, 6, 20] as const;

type EnsureSeedRecordOptions<TableName extends TableNames> = {
  lookup: () => Promise<Doc<TableName> | null>;
  create: () => Promise<Id<TableName>>;
  patchIfExists?: (existing: Doc<TableName>) => Promise<void>;
  label?: string;
};

function normalizeIndex(idx: number): number {
  if (!Number.isFinite(idx)) {
    return 0;
  }
  return Math.abs(Math.trunc(idx));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeFlat(flatNumber: string): string {
  return flatNumber.trim().toUpperCase();
}

function assertPositiveInteger(label: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`generatePlaceholderPng: ${label} must be a positive number`);
  }
  return Math.trunc(value);
}

function assertChannel(label: string, value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 255) {
    throw new Error(`generatePlaceholderPng: ${label} must be in the range 0..255`);
  }
  return Math.trunc(value);
}

function writeUint32BE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? (crc >>> 1) ^ CRC32_POLYNOMIAL : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i += 1) {
    a = (a + data[i]) % ADLER_MOD;
    b = (b + a) % ADLER_MOD;
  }
  return ((b << 16) | a) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  if (type.length !== 4) {
    throw new Error(`pngChunk: chunk type must be exactly 4 bytes, received "${type}"`);
  }

  const typeBytes = textEncoder.encode(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32BE(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);

  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  writeUint32BE(chunk, 8 + data.length, crc32(crcInput));

  return chunk;
}

function zlibStoredCompress(data: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  let offset = 0;

  while (offset < data.length) {
    const remaining = data.length - offset;
    const len = Math.min(remaining, 0xffff);
    const isFinal = offset + len >= data.length;
    const nlen = ~len & 0xffff;
    const block = new Uint8Array(5 + len);

    block[0] = isFinal ? 0x01 : 0x00;
    block[1] = len & 0xff;
    block[2] = (len >>> 8) & 0xff;
    block[3] = nlen & 0xff;
    block[4] = (nlen >>> 8) & 0xff;
    block.set(data.subarray(offset, offset + len), 5);

    chunks.push(block);
    offset += len;
  }

  const adler = new Uint8Array(4);
  writeUint32BE(adler, 0, adler32(data));
  chunks.push(adler);

  return concatBytes(chunks);
}

type DeflateSyncFn = (input: Uint8Array, options?: { level?: number }) => Uint8Array;

function getNodeDeflateSync(): DeflateSyncFn | null {
  try {
    const requireCandidate = Function(
      "return typeof require === 'function' ? require : undefined;",
    )() as unknown;

    if (typeof requireCandidate !== "function") {
      return null;
    }

    const zlibModule = (requireCandidate as (name: string) => unknown)("node:zlib") as {
      deflateSync?: DeflateSyncFn;
    };

    if (typeof zlibModule.deflateSync !== "function") {
      return null;
    }

    return zlibModule.deflateSync;
  } catch {
    return null;
  }
}

function compressPngData(rawData: Uint8Array): Uint8Array {
  const deflateSync = getNodeDeflateSync();
  if (deflateSync) {
    try {
      return deflateSync(rawData, { level: 9 });
    } catch {
      return zlibStoredCompress(rawData);
    }
  }

  return zlibStoredCompress(rawData);
}

export async function lookupUserDoc(ctx: MutationCtx, email: string): Promise<Doc<"users">> {
  const normalizedEmail = normalizeEmail(email);

  // First try direct email lookup
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
    .first();

  if (user) {
    return user;
  }

  // For synthetic emails (guard/OPS), the email field may not be stored.
  // Extract the phone from the email prefix and look up by phone instead.
  const syntheticDomains = ["@guards.local", "@ops.local"];
  for (const domain of syntheticDomains) {
    if (normalizedEmail.endsWith(domain)) {
      const phone = normalizedEmail.replace(domain, "");
      if (/^\d{10}$/.test(phone)) {
        const byPhone = await ctx.db
          .query("users")
          .withIndex("by_phone", (q) => q.eq("phone", phone))
          .first();
        if (byPhone) {
          return byPhone;
        }
      }
    }
  }

  throw new Error(`lookupUserDoc: user not found for email "${normalizedEmail}"`);
}

export async function lookupUser(ctx: MutationCtx, email: string): Promise<Id<"users">> {
  const user = await lookupUserDoc(ctx, email);
  return user._id;
}

export async function lookupUserByPhone(
  ctx: MutationCtx,
  phone: string,
): Promise<Doc<"users"> | null> {
  const normalized = normalizePhone(phone);
  return await ctx.db
    .query("users")
    .withIndex("by_phone", (q) => q.eq("phone", normalized))
    .first();
}

export async function lookupSocietyDoc(ctx: MutationCtx, name: string): Promise<Doc<"societies">> {
  const society = await ctx.db
    .query("societies")
    .withIndex("by_name", (q) => q.eq("name", name.trim()))
    .first();

  if (!society) {
    throw new Error(`lookupSocietyDoc: society not found for name \"${name.trim()}\"`);
  }

  return society;
}

export async function lookupSociety(ctx: MutationCtx, name: string): Promise<Id<"societies">> {
  const society = await lookupSocietyDoc(ctx, name);
  return society._id;
}

export async function lookupBuildingInSociety(
  ctx: MutationCtx,
  societyId: Id<"societies">,
  name: string,
): Promise<Id<"buildings">> {
  const trimmedName = name.trim();
  const building = await ctx.db
    .query("buildings")
    .withIndex("by_society_and_name", (q) => q.eq("society_id", societyId).eq("name", trimmedName))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .first();

  if (!building) {
    throw new Error(
      `lookupBuildingInSociety: building \"${trimmedName}\" not found in society ${societyId}`,
    );
  }

  return building._id;
}

export async function lookupBuilding(ctx: MutationCtx, name: string): Promise<Id<"buildings">> {
  const trimmedName = name.trim();
  const societies = await ctx.db.query("societies").collect();
  const matches: Array<{ building: Doc<"buildings">; societyName: string }> = [];

  for (const society of societies) {
    const building = await ctx.db
      .query("buildings")
      .withIndex("by_society_and_name", (q) =>
        q.eq("society_id", society._id).eq("name", trimmedName),
      )
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .first();

    if (building) {
      matches.push({ building, societyName: society.name });
    }
  }

  if (matches.length === 0) {
    throw new Error(`lookupBuilding: building not found for name \"${trimmedName}\"`);
  }

  if (matches.length > 1) {
    const societiesWithMatch = matches.map((match) => match.societyName).join(", ");
    throw new Error(
      `lookupBuilding: building \"${trimmedName}\" is ambiguous across societies: ${societiesWithMatch}`,
    );
  }

  return matches[0].building._id;
}

export async function lookupRole(ctx: MutationCtx, roleName: string): Promise<Id<"roles">> {
  const role = await ctx.db
    .query("roles")
    .withIndex("by_name", (q) => q.eq("name", roleName.trim()))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .first();

  if (!role) {
    throw new Error(`lookupRole: role not found for name \"${roleName.trim()}\"`);
  }

  return role._id;
}

export async function lookupGuardByPhone(
  ctx: MutationCtx,
  phone: string,
): Promise<Doc<"guard_profiles">> {
  const normalized = normalizePhone(phone);
  const user = await ctx.db
    .query("users")
    .withIndex("by_phone", (q) => q.eq("phone", normalized))
    .filter((q) => q.eq(q.field("user_type"), "GUARD"))
    .first();

  if (!user) {
    throw new Error(`lookupGuardByPhone: guard user not found for phone \"${normalized}\"`);
  }

  const guardProfile = await ctx.db
    .query("guard_profiles")
    .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
    .first();

  if (!guardProfile) {
    throw new Error(
      `lookupGuardByPhone: guard profile not found for user ${user._id} (phone \"${normalized}\")`,
    );
  }

  return guardProfile;
}

export async function lookupLeadByFlat(
  ctx: MutationCtx,
  buildingId: Id<"buildings">,
  flatNumber: string,
): Promise<Doc<"leads"> | null> {
  const building = await ctx.db.get(buildingId);
  if (!building) {
    throw new Error(`lookupLeadByFlat: building not found for id ${buildingId}`);
  }

  return await ctx.db
    .query("leads")
    .withIndex("by_society_building_flat", (q) =>
      q
        .eq("society_id", building.society_id)
        .eq("building_id", buildingId)
        .eq("flat_number", normalizeFlat(flatNumber)),
    )
    .first();
}

export async function lookupListingBySlug(
  ctx: MutationCtx,
  slug: string,
): Promise<Doc<"listings"> | null> {
  return await ctx.db
    .query("listings")
    .withIndex("by_slug", (q) => q.eq("slug", slug.trim().toLowerCase()))
    .first();
}

export async function lookupOwnerByPhone(
  ctx: MutationCtx,
  phone: string,
): Promise<Doc<"owners"> | null> {
  const normalized = normalizePhone(phone);
  return await ctx.db
    .query("owners")
    .withIndex("by_phone", (q) => q.eq("phone", normalized))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .first();
}

export async function lookupOwnerByEmail(
  ctx: MutationCtx,
  email: string,
): Promise<Doc<"owners"> | null> {
  const normalizedEmail = normalizeEmail(email);
  return await ctx.db
    .query("owners")
    .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .first();
}

export async function lookupTenantProfileByEmail(
  ctx: MutationCtx,
  email: string,
): Promise<Doc<"tenant_profiles">> {
  const tenantUser = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
    .filter((q) => q.eq(q.field("user_type"), "TENANT"))
    .first();

  if (!tenantUser) {
    throw new Error(`lookupTenantProfileByEmail: tenant user not found for email \"${email}\"`);
  }

  const tenantProfile = await ctx.db
    .query("tenant_profiles")
    .withIndex("by_user_id", (q) => q.eq("user_id", tenantUser._id))
    .first();

  if (!tenantProfile) {
    throw new Error(
      `lookupTenantProfileByEmail: tenant profile not found for user ${tenantUser._id}`,
    );
  }

  return tenantProfile;
}

export function daysAgo(days: number): number {
  return Date.now() - normalizeIndex(days) * DAY_MS;
}

export function hoursAgo(hours: number): number {
  return Date.now() - normalizeIndex(hours) * HOUR_MS;
}

export function minutesAgo(minutes: number): number {
  return Date.now() - normalizeIndex(minutes) * MINUTE_MS;
}

export function daysFromNow(days: number): number {
  return Date.now() + normalizeIndex(days) * DAY_MS;
}

export function indianFirstName(idx: number): string {
  return FIRST_NAMES[normalizeIndex(idx) % FIRST_NAMES.length];
}

export function indianLastName(idx: number): string {
  return LAST_NAMES[normalizeIndex(idx) % LAST_NAMES.length];
}

export function generatePhone(idx: number): string {
  const normalized = normalizeIndex(idx);
  const prefixes = ["9", "8", "7"] as const;
  const suffix = (100_000_000 + (normalized % 900_000_000)).toString();
  return `${prefixes[normalized % prefixes.length]}${suffix}`;
}

export function generateFlat(idx: number): string {
  const normalized = normalizeIndex(idx);
  const wing = FLAT_WINGS[Math.floor(normalized / FLAT_FLOORS.length) % FLAT_WINGS.length];
  const floor = FLAT_FLOORS[normalized % FLAT_FLOORS.length];
  const unit = ((Math.floor(normalized / (FLAT_FLOORS.length * FLAT_WINGS.length)) % 8) + 1)
    .toString()
    .padStart(2, "0");

  return `${wing}-${floor}${unit}`;
}

export function generateRentPaise(idx = 0): number {
  return RENT_OPTIONS_RUPEES[normalizeIndex(idx) % RENT_OPTIONS_RUPEES.length] * 100;
}

export function mumbaiLocality(idx: number): string {
  return MUMBAI_LOCALITIES[normalizeIndex(idx) % MUMBAI_LOCALITIES.length];
}

export function generatePlaceholderPng(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): Uint8Array {
  const safeWidth = assertPositiveInteger("width", width);
  const safeHeight = assertPositiveInteger("height", height);
  const red = assertChannel("r", r);
  const green = assertChannel("g", g);
  const blue = assertChannel("b", b);

  const rowSize = 1 + safeWidth * 4;
  const raw = new Uint8Array(rowSize * safeHeight);

  for (let y = 0; y < safeHeight; y += 1) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0;

    for (let x = 0; x < safeWidth; x += 1) {
      const pixel = rowOffset + 1 + x * 4;
      raw[pixel] = red;
      raw[pixel + 1] = green;
      raw[pixel + 2] = blue;
      raw[pixel + 3] = 255;
    }
  }

  const ihdr = new Uint8Array(13);
  writeUint32BE(ihdr, 0, safeWidth);
  writeUint32BE(ihdr, 4, safeHeight);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idatPayload = compressPngData(raw);

  return concatBytes([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idatPayload),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

export async function ensureSeedRecord<TableName extends TableNames>(
  ctx: MutationCtx,
  options: EnsureSeedRecordOptions<TableName>,
): Promise<{ doc: Doc<TableName>; created: boolean }> {
  const existing = await options.lookup();

  if (!existing) {
    const insertedId = await options.create();
    const inserted = await ctx.db.get(insertedId);
    if (!inserted) {
      const label = options.label ?? "record";
      throw new Error(
        `ensureSeedRecord: created ${label} but could not reload document ${insertedId}`,
      );
    }
    return { doc: inserted, created: true };
  }

  if (options.patchIfExists) {
    await options.patchIfExists(existing);
    const refreshed = await ctx.db.get(existing._id);
    if (!refreshed) {
      const label = options.label ?? "record";
      throw new Error(`ensureSeedRecord: ${label} ${existing._id} disappeared after patch`);
    }
    return { doc: refreshed, created: false };
  }

  return { doc: existing, created: false };
}
