# Paywhatyouwant.io — bespoke platform

Replacement for the WordPress/Easy-Digital-Downloads site at paywhatyouwant.io.
Digital-only pay-what-you-want marketplace: music, photography, podcasts,
digital art, ebooks.

## Getting started

```bash
docker compose up -d          # Postgres 18 on host port 5433
cp .env.example .env          # then generate AUTH_SECRET (see below)
npx prisma migrate dev
npm run dev                   # http://localhost:3000
```

Generate an auth secret:
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

> Postgres runs in Docker on **5433**, deliberately avoiding the native
> PostgreSQL 18 service on 5432. Start the container before any Prisma command.

## Migrating from the old WordPress site

Three stages, each independently re-runnable:

```bash
npm run migrate:parse     # WXR export  -> migration/manifest.json
npm run migrate:media     # downloads all media off paywhatyouwant.io
npm run migrate:import    # manifest    -> Postgres, writes migration-report.md
```

**`migrate:media` is time-critical.** The old site's plugins are not being
renewed; when that hosting lapses the media is gone permanently. It is
resumable and safe to re-run — completed files are skipped.

`migration/migration-report.md` records every judgement the importer made:
what was published, what was held back for review and why, and what was
dropped. Read it before treating an import as final.

### Triage policy

- Test-account uploads, placeholder titles, and old-site drafts are imported
  but marked `FLAGGED` — hidden from the public site, never deleted. Flip
  `status` to `PUBLISHED` to overturn any call.
- One rule deletes outright: credit-card-fraud material ("carding"). That is a
  legal judgement, not a quality one.

## Layout

```
prisma/schema.prisma            source of truth for the data model
scripts/                        the three migration stages + shared libs
src/app/embed/[slug]/           the embeddable widget (framable cross-origin)
src/components/pricing/         PriceControl — the signature interaction
src/lib/                        db, stripe, downloads, queries, taxonomy
storage/media/                  PRIVATE. paid files. never web-reachable.
public/media/                   covers + previews only, served statically.
```

### Two storage trees, on purpose

`storage/media` holds everything pulled off the old host and is outside the web
root; paid files are reachable only through `/api/download/[token]`, which
checks a grant tied to a completed order. Covers and free previews are copied
into `public/media` at import so a fifty-image grid does not run a database
query per thumbnail.

## Money

Integer **cents** everywhere. Convert only in `formatPrice` / `parsePriceToCents`
(`src/lib/utils.ts`). A price of `0` is valid and is the point of the platform —
guard with `=== null`, never falsiness.

## Payments

Stripe Connect, test mode. Without `STRIPE_SECRET_KEY` the app still runs and
the **$0 path works end to end**; paid checkout returns a clear 503. Orders
become `COMPLETED` only via the signed webhook, never on the browser redirect.

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## Checks

```bash
npm run typecheck && npm run lint && npm run build
```
