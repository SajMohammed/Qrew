# Qrew

A design-led, wallet-native digital **stamp-card loyalty** platform for UAE SMBs (cafes,
salons, retail). Customers add a beautiful card to Apple/Google Wallet in seconds — no app
— and merchants run it from a fast, elegant dashboard.

This repo is the **Phase 1 foundation**: the monorepo, the event-ledger data model, and
row-level tenant isolation — the parts that are expensive to retrofit, correct from commit one.

## Architecture at a glance

- **Clean FE/BE split.** React + Vite **SPAs** (dashboard, card PWA, staff scanner) and a
  **Next.js** marketing site are pure clients. A standalone **NestJS** API owns all domain logic.
- **Types end-to-end** via **zod** contracts (no tRPC). **TypeScript 7** for fast type-checking.
- **Postgres + Drizzle + Row-Level Security.** Row-level multi-tenancy: every table carries
  `merchant_id`, and RLS enforces isolation *at the database*, not just in app code.
- **Event-ledger data model.** `stamp_events` / `redemptions` are an append-only source of
  truth; `enrollments.current_stamps` is a cached projection derived from the ledger.
- **Residency-first.** Data + PII-processing compute run in **AWS `me-central-1`** (UAE). See [`infra/`](infra/).

## Layout

```
apps/
  api/          # NestJS — the standalone backend (domain logic, zod, RLS)
  (dashboard, card, scanner, marketing — added in later phases)
packages/
  db/           # Drizzle schema · RLS migration · withTenant client · RLS test
  contracts/    # zod schemas — the single source of truth for API shapes
```

## Prerequisites

- Node **22+**, **pnpm 11**, **Docker** (for local Postgres + Redis)

## Quickstart

```bash
cp .env.example .env
pnpm install

# 1) start local Postgres + Redis
pnpm db:up

# 2) apply the schema + RLS policies (creates the qrew_app role)
pnpm db:migrate

# 3) THE key check — prove tenant isolation actually holds
pnpm test        # runs the RLS suite: a merchant cannot read another's rows

# 4) (optional) seed a demo merchant, then run the API
pnpm db:seed
pnpm build       # compiles workspace packages (db, contracts)
pnpm dev         # starts the NestJS API on :4000

# try it (note the placeholder tenant header — real auth comes next):
curl localhost:4000/health
curl localhost:4000/loyalty/programs -H "x-merchant-id: <a-merchant-uuid>"
```

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

## A note on versions

The toolchain is deliberately current — **TypeScript 7** (the native compiler) went GA only
days ago. Dependency versions in `package.json` are indicative for mid-2026; if `pnpm install`
hits a version conflict, pin the offending package (`pnpm add <pkg>@<version>`). `.npmrc`
relaxes peer-dependency strictness so bleeding-edge TS doesn't block installs.

**TS 7 + tooling caveat (already handled):** TS 7.0 ships the `tsc` executable but not the
programmatic compiler API (that returns in 7.1, ~Oct 2026), so tools that embed it don't work
yet — notably the **Nest CLI**. We sidestep it: the API is compiled and run with **SWC**
directly (`swc` for `build`, `@swc-node/register` for `dev`), which also emits the decorator
metadata NestJS's DI needs. Type-checking still uses TS 7 (`tsc --noEmit`). Revisit once 7.1 lands.

## What's next

- **Phase 1 finish:** wire real auth (Clerk staff + phone-OTP customers), the customer +
  enrollment tables into flows, and the reconciliation job.
- **Phase 2:** the loyalty loop — `WalletProvider` + PassKit adapter, QR→wallet enrollment,
  the staff-scan PWA, wallet push. See the implementation plan for the full sequence.

Product & plan docs: the **Build Blueprint** and **Implementation Plan** (Claude artifacts).
