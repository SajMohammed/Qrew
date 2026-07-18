# Qrew

A design-led, wallet-native digital **stamp-card loyalty** platform for UAE SMBs (cafes,
salons, retail). Customers add a beautiful card to Apple/Google Wallet in seconds — no app
— and merchants run it from a fast, elegant dashboard.

The repo now runs the **full loyalty loop end-to-end** — enroll → stamp → reward-ready →
redeem — across three product surfaces, on an event-ledger data model with database-enforced
tenant isolation. Wallet passes sync asynchronously off the request path. Real auth and a live
wallet provider are the main things still stubbed (see [What's next](#whats-next)).

## Architecture at a glance

- **Clean FE/BE split.** React + Vite clients (customer **card** PWA, staff **scanner** PWA,
  owner **dashboard**) are pure clients; a standalone **NestJS** API owns all domain logic. A
  Next.js marketing site is planned.
- **Shared domain layer.** All business logic lives in `@qrew/core` (enroll, stamp, scan,
  redeem, card, dashboard, program) so the API stays a thin HTTP shell over it.
- **Types end-to-end** via **zod** contracts (no tRPC). **TypeScript 7** for fast type-checking.
- **Postgres + Drizzle + Row-Level Security.** Row-level multi-tenancy: every table carries
  `merchant_id`, and RLS enforces isolation *at the database*, not just in app code.
- **Event-ledger data model.** `stamp_events` / `redemptions` are an append-only source of
  truth; `enrollments.current_stamps` is a trigger-maintained projection, and redemption
  re-verifies eligibility against the ledger (never the cache).
- **Wallet behind a port.** A `WalletProvider` interface (fake by default, PassKit adapter
  skeleton) keeps Apple/Google specifics swappable. Stamp/redeem enqueue a **BullMQ** job so a
  slow wallet call never blocks the counter.
- **Residency-first.** Data + PII-processing compute run in **AWS `me-central-1`** (UAE). See [`infra/`](infra/).

## Layout

```
apps/
  api/            # NestJS — standalone backend (domain HTTP shell, zod, RLS)  :4000
  wallet-worker/  # BullMQ consumer — syncs wallet passes off the request path
  card/           # customer PWA — the wallet-native stamp card                :5173
  scanner/        # staff PWA — camera/QR scan to stamp                         :5174
  dashboard/      # owner SPA — stats + the self-serve card designer            :5175
  (marketing — Next.js, planned)
packages/
  core/           # shared domain: enroll · stamp · scan · redeem · card · dashboard · program
  db/             # Drizzle schema · RLS migration · ledger trigger · withTenant client · tests
  contracts/      # zod schemas — the single source of truth for API shapes
  wallet-core/    # WalletProvider port + fake and PassKit adapters
  queue/          # BullMQ wallet-sync queue (producer + job contract)
```

## Prerequisites

- Node **22+**, **pnpm 11**, **Docker** (for local Postgres + Redis)

## Quickstart

```bash
cp .env.example .env
pnpm install

# 1) start local Postgres + Redis
pnpm db:up

# 2) apply the schema + RLS policies + ledger trigger (creates the qrew_app role)
pnpm db:migrate

# 3) THE key check — prove tenant isolation + the ledger actually hold
pnpm test        # RLS suite (a merchant can't read another's rows) + domain + wallet

# 4) seed a demo merchant, build the workspace packages, then run everything
pnpm db:seed     # prints the demo merchant id + slug
pnpm build       # compiles workspace packages (core, db, contracts, wallet-core, queue)
pnpm dev         # turbo: API :4000 · wallet-worker · card :5173 · scanner :5174 · dashboard :5175
```

Then open the surfaces (`<merchant-uuid>` is printed by `db:seed`):

```
Dashboard  http://localhost:5175/?m=<merchant-uuid>          # demo PIN: any 4 digits
Scanner    http://localhost:5174/?m=<merchant-uuid>
API        curl localhost:4000/health

# the card needs the program id too — grab it from the API:
curl localhost:4000/program -H "x-merchant-id: <merchant-uuid>"   # → { id, ... }
Card       http://localhost:5173/?m=<merchant-uuid>&p=<program-uuid>
```

The Vite apps bind `0.0.0.0` and proxy `/api` to the NestJS server, so you can open them on a
phone on the same Wi-Fi (swap `localhost` for your machine's LAN IP) to test on-device.
`x-merchant-id` is a placeholder tenant header — real auth comes next.

## The product surfaces

- **Card (customer).** The wallet-native stamp card as a PWA: a themed card that polls for
  live stamp updates and renders a rotating signed QR for staff to scan. The card's colour and
  stamp icon are **the merchant's** (set in the designer); the app chrome is Qrew's.
- **Scanner (staff).** Camera QR scanning (with manual-serial fallback), idempotent + cooldown-
  guarded so a double-tap never double-stamps. Shows a live reward-ready state.
- **Dashboard (owner).** Live stats plus the **self-serve card designer** — brand colour, stamp
  icon, reward, thresholds — with a live preview. This design control is a core product USP.

## Data model & correctness

- `stamp_events` and `redemptions` are **append-only ledgers**; an `AFTER INSERT` trigger keeps
  `enrollments.current_stamps` in sync, and a `BEFORE UPDATE` guard makes the projection
  tamper-evident ([`0001_ledger_projection.sql`](packages/db/migrations/0001_ledger_projection.sql)).
  Drift is structurally impossible — no reconciliation job needed.
- Stamps and redemptions are **idempotent** via `(merchant_id, idempotency_key)` uniqueness, and
  redemption **re-computes the balance from the ledger** at the money moment rather than trusting
  the cached projection.

## Wallet integration

Everything above the `WalletProvider` port is vendor-agnostic. `enroll` issues a pass inline
(it must persist the platform ids); `stamp`/`redeem` **enqueue a wallet-sync job** on Redis, and
`apps/wallet-worker` drains it — re-reading the enrollment and updating the pass. So the cashier's
scan returns the instant the ledger commits, and a wallet-API outage degrades to "syncs late"
rather than a failed stamp. Swap the fake provider for PassKit/Google via `WALLET_PROVIDER` +
an adapter — no domain changes.

## How tenant isolation works (read this)

- The API only ever touches tenant data through **`withTenant(merchantId, db => …)`**
  ([`packages/db/src/client.ts`](packages/db/src/client.ts)). It opens a transaction and sets
  `app.merchant_id` *transaction-locally*.
- Every table's RLS policy filters on that value
  ([`packages/db/migrations/0000_init.sql`](packages/db/migrations/0000_init.sql)). If it's
  unset, queries match **no rows** (deny by default).
- The app connects as **`qrew_app`** (subject to RLS). Migrations and cross-tenant system
  jobs use the **owner/superuser** connection, which bypasses RLS by design.
- [`packages/db/test/rls.test.ts`](packages/db/test/rls.test.ts) proves it — and CI blocks
  the merge if isolation ever breaks.

## Brand & design

Design is a deliberate USP. Qrew's identity is **Qrew Lime `#CBFA5B` + deep ink green on light
shells**, with **Anton** for the wordmark/display and **Archivo** for UI, and a signature
lime→forest gradient for hero surfaces. The identity lives in each app's `styles.css` `:root`;
the customer's stamp card stays merchant-themed while the surrounding app chrome is Qrew.

## A note on versions

The toolchain is deliberately current — **TypeScript 7** (the native compiler). Dependency
versions in `package.json` are indicative for mid-2026; if `pnpm install` hits a version
conflict, pin the offending package (`pnpm add <pkg>@<version>`). `.npmrc` relaxes
peer-dependency strictness so bleeding-edge TS doesn't block installs.

**TS 7 + tooling caveat (already handled):** TS 7.0 ships the `tsc` executable but not the
programmatic compiler API (that returns in 7.1, ~Oct 2026), so tools that embed it don't work
yet — notably the **Nest CLI**. We sidestep it: the API and worker are compiled and run with
**SWC** directly (`swc` for `build`, `@swc-node/register` for `dev`), which also emits the
decorator metadata NestJS's DI needs. Type-checking still uses TS 7 (`tsc --noEmit`). Revisit
once 7.1 lands.

## What's next

- **Real auth** — Clerk for staff, phone-OTP for customers — retiring the `x-merchant-id`
  placeholder header.
- **A live wallet provider** — wire the PassKit (or native Apple/Google) adapter behind the
  existing port and light up the Add-to-Wallet buttons.
- **Marketing site** (Next.js) and **`me-central-1` deployment** ([`infra/`](infra/)).

Product & plan docs: the **Build Blueprint** and **Implementation Plan** (Claude artifacts).
