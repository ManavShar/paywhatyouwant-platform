# WordPress migration report

Generated 2026-08-14T05:18:10.354Z
Source: `paywhatyouwantio.WordPress.2026-08-13.xml`

## Summary

| | Count |
|---|---:|
| Vendors imported | 46 |
| Products imported | 154 |
| — published | 138 |
| — held for review | 16 |
| Products dropped | 1 |
| Media files missing | 1 |

## Dropped — not imported at all

These were **not** written to the database. This is the only category the importer deletes outright.

- **Carding Guide complet** — rui2343 — Credit-card fraud material — not republishable

## Held for review — imported but hidden from the public site

Each of these is in the database with status `FLAGGED`. Nothing is lost.
To publish one, change its status to `PUBLISHED`.

- **fgdfgdfgdg** — Dipendra — Placeholder title ("fgdfgdfgdg")
- **The Beauty of Interior Design** — maxtest13 — Uploaded by test account "maxtest13"
- **Up Lifting Audio Pack** — maxrangeley@gmail.com — Nothing attached — no file and no preview; Unrecognised category "(none)"
- **Innovation** — maxrangeley@gmail.com — Nothing attached — no file and no preview; Unrecognised category "(none)"
- **Beach Photo Pack** — maxrangeley@gmail.com — Nothing attached — no file and no preview; Unrecognised category "(none)"
- **A Chemex Method** — maxrangeley@gmail.com — Nothing attached — no file and no preview
- **The Beauty of Interior Design Part 2** — test14 — Uploaded by test account "test14"
- **The beauty of interior design part 3** — maxtest15 — Uploaded by test account "maxtest15"
- **The beauty of interior design part 4** — maxtest16 — Uploaded by test account "maxtest16"
- **Titian -- Allegory of Prudence** — mtest6 — Still a draft on the old site
- **Vienna Central Bank** — m5 — Uploaded by test account "m5"
- **Titian Allegory** — a4 — Uploaded by test account "a4"
- **Vienna Central bank** — mt3 — Uploaded by test account "mt3"
- **Storm and Stress - Devon Sky** — g2 — Uploaded by test account "g2"
- **IF I WERE A BOY** — Rita HillsHils — Nothing attached — no file and no preview
- **St Michael Vanquishing Satan (Raphael)** — nov5 — Uploaded by test account "nov5"

## Accounts that look like test accounts

Imported as normal vendors, but their products were held for review.

- `maxtest13` — Account name matches a test pattern
- `test14` — Account name matches a test pattern
- `maxtest15` — Account name matches a test pattern
- `maxtest16` — Account name matches a test pattern
- `m5` — Account name matches a test pattern
- `a4` — Account name matches a test pattern
- `mt3` — Account name matches a test pattern
- `g2` — Account name matches a test pattern
- `nov5` — Account name matches a test pattern

## Missing media

These files could not be fetched from the old host. **Retry `npm run migrate:media` while paywhatyouwant.io is still online** — once that hosting lapses they are unrecoverable.

- fgdfgdfgdg — `https://paywhatyouwant.io/wp-content/uploads/2020/08/New-folder.zip`
