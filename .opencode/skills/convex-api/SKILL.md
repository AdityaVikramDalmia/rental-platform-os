---
name: convex-api
description: Convex API reference for agents — validators, function types, database operations, query building, indexes, pagination, file storage, components (rate-limiter, aggregate), cron jobs, testing, and Context7 lookup breadcrumbs.
license: MIT
---

# Convex API Reference

The Convex-specific API knowledge agents need to write correct Convex functions. This is the **platform reference** — how Convex itself works.

For **project-specific patterns** (functions.ts wrapping, auth helpers, Actions, domain file structure), load `rental-platform-os-arch` instead. These two skills are complementary with zero overlap.

## When to Use

- Writing Convex queries, mutations, or actions
- Defining schema tables, indexes, or search indexes
- Using pagination, file storage, or components
- Debugging query behavior or type errors
- Need to look up exact API signatures

---

## Validators (`v` from `convex/values`)

Every schema field and function argument uses validators. Import: `import { v } from "convex/values";`

### Primitive Validators

| Validator | TypeScript Type | Notes |
|-----------|----------------|-------|
| `v.string()` | `string` | |
| `v.number()` | `number` | IEEE 754 float64 |
| `v.boolean()` | `boolean` | |
| `v.int64()` | `bigint` | For precise large integers |
| `v.float64()` | `number` | Explicit float (same as `v.number()`) |
| `v.bytes()` | `ArrayBuffer` | Binary data |
| `v.null()` | `null` | |
| `v.any()` | `any` | Escape hatch — avoid in schemas |

### Reference Validators

| Validator | TypeScript Type | Notes |
|-----------|----------------|-------|
| `v.id("tableName")` | `Id<"tableName">` | Reference to a document in another table |
| `v.id("_storage")` | `Id<"_storage">` | Reference to a stored file |

### Compound Validators

| Validator | TypeScript Type | Notes |
|-----------|----------------|-------|
| `v.object({ key: v.string() })` | `{ key: string }` | Object with exact shape |
| `v.array(v.string())` | `string[]` | Homogeneous array |
| `v.record(v.string(), v.number())` | `Record<string, number>` | Key-value map |

### Modifier Validators

| Validator | Effect | Notes |
|-----------|--------|-------|
| `v.optional(v.string())` | `string \| undefined` | Field can be omitted |
| `v.union(v.literal("A"), v.literal("B"))` | `"A" \| "B"` | Discriminated union |
| `v.literal("VALUE")` | `"VALUE"` | Exact string/number/boolean match |

### Gotchas

- **No `v.enum()`** — use `v.union(v.literal("A"), v.literal("B"), ...)` instead.
- **No `v.date()`** — store dates as `v.number()` (Unix milliseconds).
- **No `v.map()` or `v.set()`** — use `v.array(v.object(...))` or `v.record(...)`.
- **`v.optional()` means the field can be absent**, not that it can be `null`. For nullable: `v.union(v.string(), v.null())`. For optional nullable: `v.optional(v.union(v.string(), v.null()))`.

---

## Function Types

### Public Functions (callable from client)

```typescript
import { query, mutation, action } from "./_generated/server";
// NOTE: In this project, import mutation/internalMutation from ./functions.ts instead!

export const myQuery = query({
  args: { name: v.string() },           // Auto-validated, type-safe
  handler: async (ctx, args) => { ... }, // ctx: QueryCtx
});

export const myMutation = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => { ... }, // ctx: MutationCtx
});

export const myAction = action({
  args: { url: v.string() },
  handler: async (ctx, args) => { ... }, // ctx: ActionCtx
});
```

### Internal Functions (callable only from other server functions)

```typescript
import { internalQuery, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Define
export const doInternal = internalMutation({ args: {...}, handler: async (ctx, args) => {...} });

// Call from another function
await ctx.runMutation(internal.myModule.doInternal, { ... });
```

### Context Objects — What Each Can Do

| Capability | `QueryCtx` | `MutationCtx` | `ActionCtx` |
|-----------|:----------:|:-------------:|:-----------:|
| `ctx.db` (read) | Yes | Yes | **No** |
| `ctx.db` (write) | **No** | Yes | **No** |
| `ctx.auth` | Yes | Yes | Yes |
| `ctx.storage` (read) | Yes | Yes | Yes |
| `ctx.storage` (write) | **No** | Yes | Yes |
| `ctx.scheduler` | **No** | Yes | Yes |
| `ctx.runQuery()` | **No** | **No** | Yes |
| `ctx.runMutation()` | **No** | **No** | Yes |
| `ctx.runAction()` | **No** | **No** | Yes |
| `fetch()` / external APIs | **No** | **No** | Yes |

**Key rule**: Actions have NO direct `ctx.db`. They must call mutations/queries via `ctx.runMutation(internal.module.fn, args)`.

---

## Database Operations (`ctx.db`)

Available in `QueryCtx` (read) and `MutationCtx` (read+write).

### Read Operations

```typescript
const doc = await ctx.db.get(id);                    // Doc | null — by _id
const docs = await ctx.db.query("tableName")         // Query builder (see below)
  .collect();                                         // Doc[]
```

### Write Operations (MutationCtx only)

```typescript
const id = await ctx.db.insert("tableName", { ... }); // Returns Id<"tableName">
await ctx.db.patch(id, { field: newValue });           // Partial update (merge)
await ctx.db.replace(id, { ...fullDoc });              // Full replace (all fields required)
await ctx.db.delete(id);                               // Hard delete from DB
```

**Gotcha**: `ctx.db.patch()` merges fields. Unmentioned fields are unchanged. To unset an optional field, pass `undefined` explicitly.

---

## Query Building

Queries are built by chaining methods. **Order matters.**

### Chain Order

```typescript
ctx.db.query("tableName")     // 1. Start with table
  .withIndex("indexName", ...) // 2. Optional: filter by index (OR withSearchIndex)
  .filter(...)                 // 3. Optional: post-index filter
  .order("asc" | "desc")      // 4. Optional: sort (default: "asc" by _creationTime)
  .paginate(paginationOpts)    // 5a. Terminal: paginated results
  // OR
  .first()                     // 5b. Terminal: first match or null
  .unique()                    // 5c. Terminal: exactly one match or throws
  .collect()                   // 5d. Terminal: all matches as array
  .take(n)                     // 5e. Terminal: first n matches
```

### Index Queries (`.withIndex`)

**Always prefer indexes over `.filter()` for performance.**

```typescript
// Single field
.withIndex("by_status", (q) => q.eq("status", "ACTIVE"))

// Compound index — fields MUST be queried in index order
.withIndex("by_society_and_status", (q) =>
  q.eq("society_id", societyId).eq("status", "SUBMITTED")
)

// Range query on the LAST indexed field
.withIndex("by_scheduled_start", (q) =>
  q.gte("scheduled_start", startOfDay).lt("scheduled_start", endOfDay)
)
```

### Index Range Operators

| Operator | Meaning |
|----------|---------|
| `q.eq(field, value)` | Exact match |
| `q.gt(field, value)` | Greater than |
| `q.gte(field, value)` | Greater than or equal |
| `q.lt(field, value)` | Less than |
| `q.lte(field, value)` | Less than or equal |

**Compound index rule**: You MUST use `eq` for all prefix fields, and can use a range operator (`gt`/`gte`/`lt`/`lte`) ONLY on the last field you query.

```typescript
// Index: ["society_id", "status", "_creationTime"]
// VALID:
q.eq("society_id", id).eq("status", "SUBMITTED")                              // eq, eq
q.eq("society_id", id).eq("status", "SUBMITTED").gte("_creationTime", since)   // eq, eq, range
q.eq("society_id", id)                                                          // eq (partial prefix)

// INVALID:
q.eq("society_id", id).gte("status", "A").eq("_creationTime", ts)  // range before eq
q.eq("status", "SUBMITTED")                                         // skipped prefix field
```

### Post-Index Filter (`.filter`)

Use for conditions indexes can't handle. Scans matching rows.

```typescript
.filter((q) => q.neq(q.field("is_deleted"), true))
.filter((q) => q.and(
  q.neq(q.field("status"), "REJECTED"),
  q.gte(q.field("_creationTime"), cutoffTime)
))
```

Filter operators: `q.eq`, `q.neq`, `q.gt`, `q.gte`, `q.lt`, `q.lte`, `q.and(...)`, `q.or(...)`, `q.not(...)`, `q.field("name")`.

### Search Index Queries

```typescript
// Define in schema
defineTable({ ... })
  .searchIndex("search_name", {
    searchField: "name",           // The field to full-text search
    filterFields: ["city", "status"], // Fields for exact-match filters
  })

// Query
const results = await ctx.db
  .query("societies")
  .withSearchIndex("search_name", (q) => {
    let search = q.search("name", searchText);    // Full-text on searchField
    if (city) search = search.eq("city", city);    // Exact match on filterFields
    return search;
  })
  .take(20);
```

**Gotcha**: Search index queries return results by relevance, NOT by `_creationTime`. You cannot chain `.order()` after `.withSearchIndex()`.

---

## Pagination

### Server Side

```typescript
import { paginationOptsValidator } from "convex/server";

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,  // { numItems: number, cursor: string | null }
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("leads")
      .withIndex("by_status", (q) => q.eq("status", args.status!))
      .order("desc")
      .paginate(args.paginationOpts);
    // Returns: { page: Doc[], isDone: boolean, continueCursor: string }
  },
});
```

### Client Side

```typescript
import { usePaginatedQuery } from "convex/react";

const { results, status, loadMore, isLoading } = usePaginatedQuery(
  api.leads.list,
  { status: "SUBMITTED" },         // Args WITHOUT paginationOpts (injected by hook)
  { initialNumItems: 20 },         // First page size
);

// status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted"
// loadMore(n) — loads next n items
// results — ALL loaded items concatenated across pages
```

**Gotcha**: `numItems` is only the initial page size. After the first load, Convex returns all items in the query range to maintain page adjacency. If args change, pagination resets to page 1.

---

## File Storage

### Upload Flow (3 Steps)

```typescript
// Step 1: Server — generate upload URL (auth-protected)
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();  // Returns signed URL string
  },
});

// Step 2: Client — POST file to the signed URL
const url = await generateUploadUrl();
const result = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": file.type },
  body: file,
});
const { storageId } = await result.json();  // Id<"_storage">

// Step 3: Client — pass storageId to a mutation that saves it
await createListing({ ..., photo_storage_id: storageId });
```

### Reading Files

```typescript
const url = await ctx.storage.getUrl(storageId);  // string | null (signed URL)
```

### Deleting Files

```typescript
await ctx.storage.delete(storageId);  // MutationCtx or ActionCtx
```

### Schema Type

```typescript
photo_storage_id: v.optional(v.id("_storage")),  // Reference to stored file
```

---

## Components

### Registration (`convex/convex.config.ts`)

```typescript
import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";

const app = defineApp();
app.use(rateLimiter);                            // Default name
app.use(aggregate, { name: "leadCounts" });      // Named instance
app.use(aggregate, { name: "visitCounts" });     // Multiple instances OK
export default app;
```

### Accessing Components in Functions

```typescript
import { components } from "./_generated/api";  // Auto-generated
// Pass to component constructors:
const rateLimiter = new RateLimiter(components.rateLimiter, { ... });
```

### Rate Limiter (`@convex-dev/rate-limiter`)

```typescript
import { RateLimiter, MINUTE, HOUR, SECOND } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Fixed window: N requests per time period, resets at period boundary
  "guard:lead_submission": {
    kind: "fixed window",
    rate: 5,
    period: 24 * HOUR,
  },
  // Token bucket: steady rate with burst capacity
  sendMessage: {
    kind: "token bucket",
    rate: 10,          // 10 per period
    period: MINUTE,
    capacity: 3,       // Burst up to 3
  },
});

// In a mutation — throws ConvexError if limit exceeded
await rateLimiter.limit(ctx, "guard:lead_submission", { key: guardId });

// Check without consuming (returns { ok, retryAfter })
const status = await rateLimiter.check(ctx, "guard:lead_submission", { key: guardId });
if (!status.ok) throw new Error("Rate limited");

// With inline config override
await rateLimiter.limit(ctx, "custom", { key: id, config: { kind: "fixed window", rate: 3, period: HOUR } });
```

**Time constants**: `SECOND`, `MINUTE`, `HOUR` exported from `@convex-dev/rate-limiter`.

### Aggregate Component (`@convex-dev/aggregate`)

Used with Triggers for automatic counter maintenance.

```typescript
import { TableAggregate } from "@convex-dev/aggregate";
import { Triggers } from "convex-helpers/server/triggers";

// Define aggregate with namespace key and optional sort/sum
const aggregateByScore = new TableAggregate<
  [string],    // Namespace key type (e.g., [userId])
  DataModel,
  "leaderboard"
>(components.leadCounts, {
  namespace: (doc) => [doc.userId],
  sortKey: (doc) => doc.score,
  sumValue: (doc) => doc.score,
});

// Register trigger — auto-updates aggregate on insert/update/delete
const triggers = new Triggers<DataModel>();
triggers.register("leaderboard", aggregateByScore.trigger());

// Wrap mutation with triggers (same pattern as audit triggers)
const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));

// Query the aggregate
const count = await aggregateByScore.count(ctx, { namespace: [userId] });
const sum = await aggregateByScore.sum(ctx, { namespace: [userId] });
```

---

## Cron Jobs

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily at specific UTC time
crons.daily("daily-snapshot", { hourUTC: 19, minuteUTC: 0 },
  internal.analytics.computeDailySnapshot
);

// Fixed interval
crons.interval("cleanup", { hours: 1 },
  internal.maintenance.cleanup
);

// Cron expression
crons.cron("weekly-report", "0 9 * * 1",  // Every Monday at 9 AM UTC
  internal.reports.weekly
);

export default crons;
```

---

## Testing (`convex-test`)

```typescript
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

describe("leads", () => {
  test("guard can submit a lead", async () => {
    const t = convexTest(schema);

    // Set up auth identity
    t.withIdentity({ subject: "workos_user_123", issuer: "https://api.workos.com/" });

    // Seed data
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { ... });
    });

    // Call the function under test
    const result = await t.mutation(api.leads.create, { ... });

    // Assert
    expect(result).toBeDefined();
  });
});
```

---

## Key Gotchas & Footguns

| Gotcha | Details |
|--------|---------|
| **No `v.enum()`** | Use `v.union(v.literal("A"), v.literal("B"))` |
| **No direct DB in Actions** | Actions must use `ctx.runMutation`/`ctx.runQuery` for DB access |
| **Mutations are transactional** | All writes in a mutation succeed or fail together |
| **Actions are NOT transactional** | Each `ctx.runMutation` call is its own transaction |
| **Queries must be deterministic** | No `Date.now()`, `Math.random()`, or side effects in queries |
| **`.collect()` on large tables** | Always use `.withIndex()` + `.take(n)` or `.paginate()` — never `.collect()` without index |
| **Search index + order** | `.withSearchIndex()` returns by relevance — cannot chain `.order()` |
| **Compound index prefix** | Must query fields in order; can't skip prefix fields |
| **`v.optional` vs `v.null`** | `v.optional()` = field absent; `v.null()` = field present with null value |
| **Internal functions** | Use `internal.module.fn` (from `_generated/api`), NOT `api.module.fn` |
| **`_creationTime`** | Auto-added to all documents. Type: `number` (Unix ms). Indexed implicitly. |
| **`_id`** | Auto-added. Type: `Id<"tableName">`. Don't define in schema. |

---

## Context7 Lookup Breadcrumbs

When you need deeper Convex docs, use Context7 with these proven queries.

### Library IDs

| ID | Content | Best For |
|----|---------|----------|
| `/llmstxt/convex_dev_llms_txt` | 1710 snippets, score 90.2 | Primary reference (use this first) |
| `/llmstxt/convex_dev_llms-full_txt` | 4147 snippets, score 63.6 | Deep dive / comprehensive |
| `/get-convex/convex-js` | 87 snippets, score 93.1 | Client-side JS/TS APIs |
| `/get-convex/convex-backend` | 1381 snippets, score 76.4 | Backend internals |

### Queries That Return Useful Results

| Topic | Query String | Library ID |
|-------|-------------|------------|
| Schema + validators | `schema definition defineSchema defineTable validators v.string v.number v.id v.union v.literal v.array v.object v.optional index searchIndex` | `/llmstxt/convex_dev_llms_txt` |
| Pagination | `pagination usePaginatedQuery paginationOptsValidator cursor paginate method` | `/llmstxt/convex_dev_llms_txt` |
| Functions + context | `query mutation action function definition args handler ctx context QueryCtx MutationCtx ActionCtx internal function` | `/llmstxt/convex_dev_llms_txt` |
| Database operations | `database operations ctx.db.get insert patch replace delete query withIndex filter order first unique collect` | `/llmstxt/convex_dev_llms-full_txt` |
| File storage | `file storage generateUploadUrl getUrl storage upload download` | `/llmstxt/convex_dev_llms_txt` |
| HTTP Router | `httpRouter http route request response public endpoint` | `/llmstxt/convex_dev_llms_txt` |
| Cron jobs | `cronJobs cron daily interval scheduled functions` | `/llmstxt/convex_dev_llms_txt` |
| Auth | `authentication getUserIdentity auth JWT custom provider` | `/llmstxt/convex_dev_llms_txt` |
| Components | `components defineApp app.use rate limiter aggregate` | `/llmstxt/convex_dev_llms-full_txt` |
| Testing | `convex-test testing mock identity test functions` | `/llmstxt/convex_dev_llms-full_txt` |

### Component Library IDs (resolve first with `resolve-library-id`)

| Package | Search Term |
|---------|-------------|
| `@convex-dev/rate-limiter` | `convex rate limiter` |
| `@convex-dev/aggregate` | `convex aggregate` |
| `convex-helpers` | `convex-helpers` |

### GitHub Code Search Patterns

| What | Query | Language |
|------|-------|----------|
| RateLimiter setup | `new RateLimiter(components` | TypeScript |
| Triggers pattern | `new Triggers<DataModel>` | TypeScript |
| Aggregate with triggers | `aggregateByScore.trigger()` | TypeScript |
| Custom mutation wrapping | `customMutation(rawMutation, customCtx` | TypeScript |
