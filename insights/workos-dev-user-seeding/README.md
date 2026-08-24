# WorkOS Dev User Seeding

**Date**: 2026-02-19
**Stack**: WorkOS User Management API, Convex seed, `/dev/login` page
**Time to diagnose**: ~30 minutes

## Problem: Test OPS login silently fails on `/dev/login`

### Symptom

- Click "Test OPS" button on `/dev/login` → nothing happens
- No toast error, no redirect, no console errors
- Network tab shows `POST /dev/login` returning 200 OK
- Test Admin and Test Guard work fine

### Root Cause

Two separate systems must be in sync for dev login to work:

```
WorkOS (external)          Convex DB (internal)
─────────────────          ────────────────────
email + password           workos_user_id + user_type + role
```

The dev login flow calls `workos.userManagement.authenticateWithPassword()` — this requires the user to **exist in WorkOS** with a password set. The Convex seed (`seed:init`) only creates records in the Convex DB with hardcoded WorkOS user IDs.

For Admin (`admin@example.com`) and Guard (`9999999999@guards.local`), the WorkOS users were created manually during initial setup. Their real WorkOS IDs were hardcoded in `convex/seed.ts`.

For OPS (`8888888888@ops.local`), the WorkOS user was **never created**. The seed had a placeholder ID (`user_01OPSTEST000000000000000`) that didn't correspond to any real WorkOS user.

```
authenticateWithPassword("8888888888@ops.local", "DevOps123!")
  → WorkOS: "user not found" (or generic error)
  → devLogin() returns { error: "..." }
  → toast.error() fires but may be missed (fast disappear, no visual indicator)
```

### Why It's Silent

The `devLogin` server action catches the WorkOS error and returns `{ error: message }`. The page shows a toast via `sonner`, but:

1. The toast auto-dismisses quickly
2. No persistent error state is rendered on the page
3. The button's loading state resets, making it look like nothing happened

### The Fix

Created `ensureDevWorkosUsers` — a Convex internalAction that ensures all 4 test users exist in **both** WorkOS and Convex:

```bash
npx convex run actions/workos:ensureDevWorkosUsers
# or
npm run seed:dev
```

The action:

1. **Lists** each user in WorkOS by email (idempotent — doesn't fail if user exists)
2. **Creates** if not found, with email + password + emailVerified
3. **Syncs password** on existing users (handles password drift)
4. Runs `seed:init` (Convex DB records — roles, users, societies, buildings, config)
5. Runs `seed:syncWorkosIds` (patches Convex users with real WorkOS IDs)

### Architecture

```
ensureDevWorkosUsers (Convex Action — can call external APIs)
  │
  ├─ For each dev account:
  │    ├─ workos.userManagement.listUsers({ email })
  │    ├─ If missing: workos.userManagement.createUser({ email, password, ... })
  │    └─ If exists: workos.userManagement.updateUser({ password })
  │
  ├─ ctx.runMutation(seed:init)         ← Convex DB records
  └─ ctx.runMutation(seed:syncWorkosIds) ← Patches workos_user_id mismatches
```

`syncWorkosIds` looks up users by email (admins) or phone + user_type (guards/ops), then patches `workos_user_id` if it differs. This handles the transition from placeholder IDs to real IDs.

### Files Changed

| File                       | Change                                                                        |
| -------------------------- | ----------------------------------------------------------------------------- |
| `convex/actions/workos.ts` | Added `ensureDevWorkosUsers` internalAction                                   |
| `convex/seed.ts`           | Added `syncWorkosIds` internalMutation, updated OPS placeholder ID to real ID |
| `package.json`             | Added `seed:dev` script                                                       |

### Debugging Checklist

When a dev login button does nothing:

1. **Open Network tab** — is the POST returning 200? (200 with error payload looks like success)
2. **Check WorkOS user exists** — `curl -H "Authorization: Bearer $WORKOS_API_KEY" "https://api.workos.com/user_management/users?email=THE_EMAIL"`. Empty `data` array = user doesn't exist in WorkOS.
3. **Check Convex user exists** — Convex dashboard → `users` table → filter by phone or email
4. **Check WorkOS ID matches** — The `workos_user_id` in Convex must match the `id` from the WorkOS API response
5. **Re-run the full seed** — `npm run seed:dev` fixes all of the above

### Key Insight

```
npm run seed        → Convex DB only (assumes WorkOS users already exist)
npm run seed:dev    → WorkOS users + Convex DB + ID sync (safe for fresh environments)
```

Always use `seed:dev` when setting up a new environment. Use `seed` only for re-seeding Convex data when WorkOS users are already confirmed.
