# Infrastructure — residency-first (AWS me-central-1)

Qrew stores UAE residents' personal data (customer phone numbers), so the **data tier
and the compute that processes PII run in the UAE region, `me-central-1`, from day one.**
Local development still uses Docker Postgres/Redis — no real PII lives there.

## What runs where

| Component | Home | Notes |
|---|---|---|
| Postgres (Aurora / RDS) | **me-central-1** | Multi-AZ, PITR on, RLS enforced |
| Redis (ElastiCache) | **me-central-1** | cache · queue · rate limits |
| NestJS API (container) | **me-central-1** | ECS/Fargate or App Runner |
| Wallet worker (container) | **me-central-1** | pass push; holds signing secrets |
| Object storage (card art — **not** PII) | S3 me-central-1 or Cloudflare R2 | logos/images only |
| Frontend SPAs + marketing | global CDN | static assets, no PII at rest |

## The residency reality (be honest about this)

"Residency from day one" is fully achievable for **your database and compute**. But
several SaaS dependencies process data outside the UAE. Decide per-vendor how strict to be:

| Dependency | Default data location | If you need it in-region |
|---|---|---|
| **Customer identity + phone** | ✅ your Postgres (me-central-1) | already in-region — own the OTP via Unifonic |
| Unifonic (SMS) | UAE / MENA | ✅ already regional |
| Clerk (staff auth) | US | staff are business users, not consumer PII; or self-host auth for zero egress |
| Sentry (errors) | US/EU | scrub PII, or self-host / EU region |
| PostHog (analytics) | US/EU | EU cloud or self-host; avoid sending raw PII |
| Wallet vendor (PassKit) | outside UAE | passes carry a name + serial; assess, or self-host the wallet layer |

**Design rule already applied:** customer PII lives only in `customers` (your Postgres).
Nothing else needs the phone number, so residency is contained to the DB you control.

## Terraform

`terraform/main.tf` is a **starting skeleton**, not production-complete. Fill in your
account, VPC, subnets, and security groups. Do not commit state — use a remote backend
(S3 + DynamoDB lock). Provision with your own credentials; never hand them to tooling.
