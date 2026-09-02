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
storage/public-media/           covers + previews only, served by /media/*.
```

### Two storage trees, on purpose

`storage/media` holds everything pulled off the old host and is outside the web
root; paid files are reachable only through `/api/download/[token]`, which
checks a grant tied to a completed order. Covers and free previews are copied
into `storage/public-media` at import so a fifty-image grid does not run a database
query per thumbnail.

**A public cover is always a derived rendition, never the uploaded bytes.**
`storeUpload(file, "public", { as: "cover" })` re-encodes to a JPEG capped at
1200px *and* at three quarters of the original's long edge, so the cover is
always visibly smaller than what is being sold. This is not a performance
tweak: the WordPress import attached one file to a product twice — as the paid
download and as the cover — so 44 products were publishing the thing they were
selling. `npm run fix:exposed-files` reports that condition and `--apply`
repairs it; it is idempotent and safe to re-run.

Cover uploads accept JPEG, PNG and GIF only (`ALLOWED_COVER`). webp and avif
are excluded because the pure-JS decoder cannot read them, and a cover we
cannot shrink is one we cannot promise is not the original.

Note that the public tree is **not** under `public/`, and must not be moved
there. `next build` snapshots that directory; `next start` then serves only the
files that existed when the build ran, so anything uploaded afterwards 404s in
production while working perfectly in `next dev`. Public media is served by
`src/app/media/[...key]/route.ts`, which reads the disk per request.

## Email

Receipts and purchase-recovery links go out through `src/lib/mail.ts`. With no
SMTP configured it writes each message to `storage/outbox/` and logs a warning
rather than pretending to send — so the flow can be built and tested before the
domain has mail, and a misconfigured deployment fails visibly instead of
silently losing receipts.

This matters more than it looks. Buying does not require an account, so for a
guest the receipt is the *only* copy of their download link; `/recover` is the
way back if they lose it, and it works by emailing a single-use link rather
than by listing purchases for any address someone types in.

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
