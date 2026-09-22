# Rental Platform OS

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Rental property management platform with separate portals for admins,
ops staff, guards, owners, and tenants. Next.js + Convex + WorkOS.

## Stack

- **Next.js 16** (App Router, React 19) — web frontend
- **Convex** — real-time database, server functions, file storage
- **WorkOS AuthKit** — authentication and SSO
- **Tailwind CSS 4** + **shadcn/ui** + **Radix UI** — design system
- **OpenAI** — voice transcription (Whisper) and assistive features
- **Vitest** + **convex-test** — unit and integration testing

## Quickstart

### Zero-signup local demo (recommended for contributors)

No WorkOS account, WorkOS secrets, or network calls to WorkOS are required.

```bash
npm install

# Terminal 1 — starts the local Convex backend and Next.js with local auth.
LOCAL_AUTH=true npm run dev

# Terminal 2 — once the backend is ready, seed the five demo identities.
LOCAL_AUTH=true npm run seed
```

Open `http://127.0.0.1:3000/dev/login` and use the Admin, Guard, OPS, Tenant, or Owner
quick-login account. Local auth is development-only, creates an ignored RS256 key under
`.local-auth/`, and mints one-hour JWTs that Convex verifies against the local JWKS route.
It is inert unless both `NODE_ENV=development` and `LOCAL_AUTH=true` are present.
The first start downloads Convex's local backend if it is not already available; it does not
create or use a cloud deployment.

### WorkOS-backed development

```bash
git clone <your-fork-url> rental-platform-os
cd rental-platform-os
nvm use            # uses .nvmrc (Node 22)
npm install
cp .env.example .env.local
# Fill in the values in .env.local — see "Environment variables" below

# The Convex backend refuses to boot until these three WorkOS secrets are set
# in the CONVEX runtime (separate from .env.local):
npx convex env set WORKOS_CLIENT_ID     client_...
npx convex env set WORKOS_API_KEY       sk_test_...
npx convex env set WORKOS_WEBHOOK_SECRET whsec_...

npm run dev        # starts Next.js (3000) + Convex (3210) concurrently
```

When `LOCAL_AUTH` is absent or false, the application retains its WorkOS AuthKit flow.
In that mode, `/dev/login` signs in real WorkOS users; run `npm run seed:dev` to provision
the demo accounts.

Then visit:

- `http://localhost:3000` — public homepage
- `http://localhost:3000/dev/login` — sign in as a seeded demo
  admin/ops/guard/tenant/owner (development mode only)
- `http://localhost:3000/admin/dashboard` — admin portal
- `http://localhost:3000/guard/dashboard` — guard portal

Seed demo data with `npm run seed`.

## Environment variables

| Variable                          | Required  | Notes                                                                                                              |
| --------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| `WORKOS_CLIENT_ID`                | yes       | From [WorkOS dashboard](https://dashboard.workos.com)                                                              |
| `WORKOS_API_KEY`                  | yes       | WorkOS secret key                                                                                                  |
| `WORKOS_COOKIE_PASSWORD`          | yes       | Generate with `openssl rand -hex 32`                                                                               |
| `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | yes       | OAuth callback (default `http://localhost:3000/callback`)                                                          |
| `LOCAL_AUTH`                      | optional  | Set to `true` only for `NODE_ENV=development`; use `LOCAL_AUTH=true npm run dev`, never commit it enabled          |
| `CONVEX_DEPLOYMENT`               | yes       | `anonymous:anonymous-rental-platform-os-1` for local dev                                                           |
| `NEXT_PUBLIC_CONVEX_URL`          | yes       | Convex HTTP URL (default `http://127.0.0.1:3210`)                                                                  |
| `NEXT_PUBLIC_CONVEX_SITE_URL`     | yes       | Convex HTTP-site URL (default `http://127.0.0.1:3211`)                                                             |
| `INTERNAL_API_SECRET`             | prod only | Shared secret for Next.js → Convex HTTP endpoint auth; generate with `openssl rand -hex 32`                        |
| `OPENAI_API_KEY`                  | optional  | Required only if you enable voice transcription                                                                    |
| `DEMO_SEEDING_ENABLED`            | optional  | Convex runtime only. Set to `true` only on an isolated demo deployment before invoking internal demo seed commands |
| `DEMO_ADMIN_PASSWORD`             | demo only | Required to create a missing Admin fixture; no fallback is used and existing accounts are not changed              |
| `DEMO_GUARD_PASSWORD`             | demo only | Required to create a missing Guard fixture; no fallback is used and existing accounts are not changed              |
| `DEMO_OPS_PASSWORD`               | demo only | Required to create a missing OPS fixture; no fallback is used and existing accounts are not changed                |
| `DEMO_TENANT_PASSWORD`            | demo only | Required to create a missing Tenant fixture; no fallback is used and existing accounts are not changed             |
| `DEMO_OWNER_PASSWORD`             | demo only | Required to create a missing Owner fixture; no fallback is used and existing accounts are not changed              |

See `.env.example` for the complete template.

## Scripts

| Script              | Purpose                         |
| ------------------- | ------------------------------- |
| `npm run dev`       | Run Next.js + Convex together   |
| `npm run dev:force` | Kill stale ports then run dev   |
| `npm run build`     | Production Next.js build        |
| `npm run typecheck` | TypeScript without emit         |
| `npm run lint`      | ESLint                          |
| `npm test`          | Vitest unit + integration tests |
| `npm run seed`      | Seed demo data into Convex      |
| `npm run seed:dev`  | Provision dev WorkOS users      |

## Project structure

```
convex/         Convex schema, queries, mutations, actions, seeds
src/app/        Next.js App Router routes — (admin), (public), guard, dev
src/components/ Shared React components
lib/            Constants, validators, utilities
messages/       i18n catalogs (en, hi, hinglish)
notes/          Architecture and decision documentation
tasks/          Implementation plans organised by phase
public/         Static assets + PWA manifests
```

## Documentation

The repo includes its full implementation history as reference material:

- `AGENTS.md` — agent workflow and conventions
- `notes/` — product architecture, data models, role/permission system, state machines
- `tasks/` — phase-by-phase implementation plans
- `bugs/` — historical bug reports
- `insights/` — investigation notes
- `verification/` — manual QA logs

## License

[MIT](LICENSE) — Copyright (c) 2026 Aditya Vikram Dalmia.
