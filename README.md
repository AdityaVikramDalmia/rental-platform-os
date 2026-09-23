# Rental Platform OS

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A prototype operating system for a residential rental company, published as a reference
implementation. A single Next.js app serves a public listings site and five role-specific
portals, all backed by one Convex database:

| Portal     | Routes      | Who uses it                                                                                 |
| ---------- | ----------- | ------------------------------------------------------------------------------------------- |
| Tenant     | `/tenant/*` | Renters: saved listings, inquiries, visits, messages and negotiation, transactions, referrals |
| Owner      | `/owner/*`  | Property owners: properties, leads, earnings, documents, service requests, messages         |
| Operations | `/ops/*`    | Field staff: leads, visits, document collection, move-in handover, closures                 |
| Guard      | `/guard/*`  | Society security guards: vacancy leads, visit bounties, shifts, earnings (installable PWA)   |
| Admin      | `/admin/*`  | Back office: societies, guards, leads, listings, negotiations, payouts, incentives, roles, audit |

OPS users can also open the admin pages their role permissions allow.

Each portal has its own sign-in route (`/tenant/login`, `/owner/login`, `/ops/login`,
`/guard/login`, `/admin/login`). The public site lives under `/homepage`, `/listings`,
`/listing/[slug]`, `/owner-services`, `/how-it-works`, `/tools` and `/contact`.

The sample brand, **DemoRentals**, is fictional. All seed data is synthetic.

## Status

This is a prototype, not a production service:

- **Identity verification and e-signing are simulated.** `convex/actions/kyc.ts` (Aadhaar OTP and
  PAN checks) and `convex/actions/esign.ts` return canned results after a short delay. They make no
  calls to a verification or e-signature provider.
- **Payments do not move real money.** No code creates a payment order. The Razorpay webhook
  endpoint verifies signatures, but its handlers in `convex/monetization.ts` only log the event.
  Payouts and commissions are ledger records: disbursing a payout stores the payment reference an
  admin enters and moves no money.
- **External notifications are simulated.** The push, SMS, WhatsApp and email adapters in
  `convex/actions/notifications.ts` record a synthetic delivery when configured and call no
  provider. In-app notifications work.
- **OpenAI features are real but optional.** Chat assistance and voice-note transcription call
  OpenAI only when `OPENAI_API_KEY` is set.
- Authentication (WorkOS AuthKit), role-based permissions, the Convex data model and the portal
  workflows are fully implemented and covered by tests.

## Stack

- **Next.js 16** (App Router, React 19) with **next-intl** (English, Hindi, Hinglish) and a
  **Serwist** service worker for the installable guard and admin PWAs
- **Convex**: database, server functions, scheduled jobs and file storage
- **WorkOS AuthKit**: sign-in, sessions and user management (`@workos-inc/authkit-nextjs` and
  `@convex-dev/workos-authkit`)
- **Tailwind CSS 4**, **shadcn/ui** on **Radix UI**, and a few **Magic UI** components
- **Vitest** with **convex-test** for backend and unit tests

## Run it locally

Requirements: Node.js 22 (as in the `Dockerfile`) and npm.

### Option A: zero-signup local mode

This mode needs no WorkOS or Convex account and makes no calls to WorkOS.

```bash
npm install

# Terminal 1: starts a local Convex backend plus Next.js with local auth.
LOCAL_AUTH=true npm run dev

# Terminal 2: once the backend is ready, seed the base data and demo identities.
LOCAL_AUTH=true npm run seed
```

Open `http://127.0.0.1:3000/dev/login` and choose the Admin, Guard, OPS, Tenant or Owner
quick-login account.

Local auth only works when `NODE_ENV=development` and `LOCAL_AUTH=true` are both set. It generates
a git-ignored RS256 key under `.local-auth/` and issues one-hour JWTs, which Convex verifies
against a local JWKS route. On first start the Convex CLI downloads its local backend binary. No
cloud deployment is created.

### Option B: your own WorkOS and Convex accounts

```bash
git clone <your-fork-url> rental-platform-os
cd rental-platform-os
npm install
cp .env.example .env.local
```

1. In your WorkOS dashboard, create an AuthKit environment. Put its client ID, API key and webhook
   secret in `.env.local`, generate `WORKOS_COOKIE_PASSWORD` with `openssl rand -hex 32`, and
   register `http://localhost:3000/callback` as a redirect URI.
2. Choose a Convex backend. Either keep the anonymous local deployment from `.env.example`, or
   delete its `CONVEX_DEPLOYMENT` line and run `npx convex dev` to link your own Convex project. The
   CLI then writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` into `.env.local`. Set
   `NEXT_PUBLIC_CONVEX_SITE_URL` to the matching `.convex.site` URL yourself.
3. The Convex functions read the WorkOS secrets from the Convex environment, not from
   `.env.local`, and refuse to start until all three are set:

   ```bash
   npx convex env set WORKOS_CLIENT_ID      client_...
   npx convex env set WORKOS_API_KEY        sk_test_...
   npx convex env set WORKOS_WEBHOOK_SECRET whsec_...
   ```

4. Start Next.js (port 3000) and `convex dev` together with `npm run dev`. Then seed the base data
   with `npm run seed`.
5. To receive user events, point a WorkOS webhook at your Convex deployment's HTTP actions URL with
   the path `/workos/webhook`.

In this mode `/dev/login` signs in with WorkOS password authentication. `npm run seed:dev` creates
the fixture users in your WorkOS environment. It only does this when `DEMO_SEEDING_ENABLED=true`
and the `DEMO_*_PASSWORD` variables are set in your Convex environment. The quick-login buttons
send the development passwords from `src/app/dev/login/accounts.ts`, so they work only if you chose
those values. Read [SECURITY.md](SECURITY.md) before seeding any deployment that other people can
reach.

## Environment variables

`.env.example` has every variable with a placeholder value.

| Variable                          | Where                        | Notes                                                                     |
| --------------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| `WORKOS_CLIENT_ID`                | `.env.local` + Convex        | From the WorkOS dashboard                                                 |
| `WORKOS_API_KEY`                  | `.env.local` + Convex        | WorkOS secret key                                                         |
| `WORKOS_WEBHOOK_SECRET`           | Convex                       | WorkOS webhook signing secret                                             |
| `WORKOS_COOKIE_PASSWORD`          | `.env.local`                 | At least 32 characters; `openssl rand -hex 32`                            |
| `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | `.env.local`                 | Defaults to `http://localhost:3000/callback`                              |
| `CONVEX_DEPLOYMENT`               | `.env.local`                 | Anonymous local deployment by default; written by `npx convex dev`        |
| `NEXT_PUBLIC_CONVEX_URL`          | `.env.local`                 | Convex client URL (local default `http://127.0.0.1:3210`)                 |
| `NEXT_PUBLIC_CONVEX_SITE_URL`     | `.env.local`                 | Convex HTTP actions URL (local default `http://127.0.0.1:3211`)           |
| `INTERNAL_API_SECRET`             | `.env.local` + Convex        | Optional in development, required in production; `openssl rand -hex 32`  |
| `OPENAI_API_KEY`                  | Convex                       | Optional; enables chat assistance and voice transcription                 |
| `LOCAL_AUTH`                      | Command line only            | `LOCAL_AUTH=true` for one development command; never commit it enabled    |
| `DEMO_SEEDING_ENABLED`            | Convex                       | `true` only on an isolated demo deployment while seeding                  |
| `DEMO_{ADMIN,GUARD,OPS,TENANT,OWNER}_PASSWORD` | Convex          | Used only to create a missing fixture account; existing ones are unchanged |

## Tests and checks

| Command                 | What it does                                                               |
| ----------------------- | -------------------------------------------------------------------------- |
| `npm test`              | Vitest unit and Convex integration tests (`convex-test`, edge runtime)     |
| `npm run typecheck`     | `tsc --noEmit`                                                             |
| `npm run lint`          | ESLint                                                                     |
| `npm run build`         | Production Next.js build                                                   |
| `npm run release:check` | Secret/link hygiene, then the four checks above, then a client-bundle scan |

Other scripts: `npm run dev:force` frees ports 3000, 3210 and 6790 before starting, and
`npm run preview` builds and serves a production build on port 3000. For Docker, see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Project structure

```
convex/         Schema, queries, mutations, actions, crons, seeds and their tests
src/app/        App Router routes: (public), (auth), (tenant), (owner), (ops), (guard), (admin), dev
src/components/ Portal and shared React components; src/components/ui holds shadcn/ui and Magic UI
lib/            Constants, validators and shared domain logic
messages/       i18n catalogs (en, hi, hinglish)
scripts/        Local-auth runner, release check, regression probes, maintenance scripts
docs/           Deployment, release notes, demo-access runbooks
notes/          Product architecture, data model, roles, state machines, decision log
tasks/          Phase-by-phase implementation plans
bugs/, insights/, verification/  Historical bug reports, investigations and QA logs
```

The repository was built with AI coding agents. `AGENTS.md` and `.opencode/skills/` hold the
conventions those agents followed, and `tasks/` is the plan they worked from.

## Demo access

A hosted demo and its access details are described at
<https://adityadalmia.com/projects/rental-os#demo-access>.

## Credits

- [shadcn/ui](https://ui.shadcn.com) (MIT) — component source in `src/components/ui/`, built on
  [Radix UI](https://www.radix-ui.com) (MIT)
- [Magic UI](https://magicui.design) (MIT) — `animated-gradient-text`, `blur-fade`, `marquee`,
  `number-ticker`, `particles` and `shimmer-button` in `src/components/ui/`
- [Geist](https://vercel.com/font) fonts (SIL Open Font License 1.1), loaded through `next/font`
- The SVGs in `public/` named `file`, `globe`, `next`, `vercel` and `window` come from the
  `create-next-app` template (MIT)

Every other dependency is installed from npm under its own licence. See `package.json`.

## Licence

[MIT](LICENSE) © Aditya Dalmia
