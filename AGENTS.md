<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project notes — Paywhatyouwant.io

## Next.js 16 specifics that bite
- `params` and `searchParams` are **Promises**. So are `cookies()`, `headers()`, `draftMode()`.
  Use the generated helpers: `export default async function Page(props: PageProps<'/product/[slug]'>)`
  then `const { slug } = await props.params`. Run `npx next typegen` if the helper types go stale.
- Request interception lives in **`proxy.ts`**, not `middleware.ts`, and the exported function is
  named `proxy`. Runtime is always nodejs — `edge` is not supported there.
- `images.domains` is gone; use `images.remotePatterns`.
- Turbopack is the default for both `next dev` and `next build`. Don't add `--turbopack`.

## Prisma 7 specifics
- The `datasource` block in `schema.prisma` must **not** contain `url`. The connection string is
  supplied by `prisma.config.ts` (for CLI/migrations) and by the `PrismaPg` driver adapter in
  `src/lib/db.ts` (for runtime).
- npm blocks postinstall scripts by default here; Prisma needs them. If engines are missing:
  `npm install-scripts approve prisma @prisma/engines`.

## Conventions
- **Money is always integer cents.** Convert only in `formatPrice` / `parsePriceToCents`
  (`src/lib/utils.ts`). Never store or compute prices as floats.
- A price of **0 is valid and must never be treated as "unset"** — it is the entire point of the
  platform. Guard with `=== null`, not falsiness.
- Postgres runs in Docker on host port **5433** to avoid colliding with the native PostgreSQL 18
  service on 5432. `docker compose up -d` before any Prisma command.
