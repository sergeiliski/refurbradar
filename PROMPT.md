# Refurb Radar: build prompt

You are building **Refurb Radar**, a site that ranks every refurbished MacBook Pro on Back Market
UK by what the visitor cares about. You are a senior developer who writes the least code that
works: no dependencies, small pure modules, boring tech, code you'd be glad to show someone.

## The job

Answer one question at a glance: *given how much I care about each spec, which MacBook Pro on
Back Market UK is the best deal for me right now?* The visitor never has to open Back Market to
find out. They open this site.

## Facts about the data (checked 2026-11-25)

- Back Market has no public buyer API; its API is seller-only.
- Every Back Market page sits behind a Cloudflare bot challenge, so the project doesn't scrape
  it directly and never tries to get past the challenge itself.
- Data comes from a hosted Apify Actor chosen by the owner, `datascrapers/backmarket-scraper`,
  at $0.003 per result with product details on the free plan ($5 monthly credit). Test runs on
  2026-11-25 showed:
  - Back Market's listing and search pages group MacBook Pros by model series, one card each.
    A targeted search (`macbook pro m4 max 16`) shows the matching configuration instead.
  - With `includeProductDetails`, each result carries the full configuration `name`, a
    `productId`, and `variants`: Back Market's option picker, with a price for every grade, the
    new-battery option, and the neighbouring memory and storage options.
  - No Actor tried (silentflow, memo23, datascrapers) fetches a single product by URL.
  - When a search has no match, Back Market shows unrelated products: `macbook pro m5 max 14`
    returned 35 iPhones. In the first full scan, 43% of the paid results were unusable.
- So the scan runs daily and pays for MacBook Pro data only: every M1–M5 chip and screen size,
  then a rotating slice of the memory and storage options those results offer. Each search is
  its own Actor run capped at one result, within a $0.15 daily budget ($4.65 over 31 days).
  Intel models are out of scope. UK only: searches run on backmarket.co.uk and anything not in
  GBP is dropped.
- Unverified: whether `/en-gb/p/<series-slug>/<productId>?l=<gradeValue>` opens that exact
  configuration and grade. The Actor only returns the series URL.
- Product slugs encode the specs, for example
  `macbook-pro-14-inch-2026-m5-pro-15-core-and-16-core-gpu-24gb-ram-ssd-1000gb-standard-display`.
  Parse every field with its own pattern; older titles order the parts differently.

## Architecture

```
GitHub Actions (daily) ─▶ scripts/update.js ─▶ Apify Actor ─▶ lib/listings.js ─▶ public/data.json
GitHub Pages ─▶ public/ (static page ranks data.json in the browser)
```

- `lib/listings.js`: pure. `parseSpecs`, `toListings` (one listing per configuration, grade and
  battery option), `followUpQueries` (memory and storage searches), `dailySlice` (which of them
  run today), `mergeScan` (one price point
  per day).
- `lib/apify.js`: start a run, wait, read the dataset. Pass `maxTotalChargeUsd` so a run can't
  overspend.
- `scripts/update.js`: fetch, normalise, merge, write. Fail loudly when nothing usable comes back,
  so an empty scan never lands in the history.
- `public/scoring.js`: `FACTORS`, `PRESETS`, `rank`, `factorsWithData`. Shared with the tests.
- `public/app.js`: DOM only. `public/styles.css`: tokens first, then sections.
- `test/`: `node:test`, no frameworks.

## Scoring

Each factor scales to 0–1 across the listings in view; `score = Σ(weight × value) / Σ weight × 100`.
Price, chip, memory (log₂), storage (log₂), year and price drop are rescaled; condition and
battery are absolute. A factor every listing shares is dimmed and weighted at zero, so a fader
never pretends to matter. Screen size and budget are filters.

## Design

Simple, with one cool thing: the **mixing desk**. Eight vertical faders machined like a studio
console in MacBook aluminium. Moving one reshuffles the ranked rows with a FLIP animation. The
hero names the best match in Archivo at full width (125) and says why it won.

- Colour: aluminium `#e3e5e8`, panel `#f2f3f5`, graphite `#1d2026`, muted `#646a74`, signal blue
  `#1f5bff`, drop green `#0f8a5f`, rise red `#c8423a`. Dark mode is space black.
- Type: Archivo only. Width 125 for display, 100 for body, 75 for fader labels on phones.
  Tabular numbers wherever prices align.
- Rows, not cards. Left-aligned. Native range inputs set vertical with `writing-mode`.
- Avoid: all-caps labels, mono data labels, middle-dot meta strings, arrows in buttons, identical
  shadowed cards, fade-in-on-scroll.

## Done when

- `npm test` passes.
- `npm run update` with a token fills `public/data.json` from real Apify results.
- `npm run dev` shows the ranking; faders re-sort it; it works at 375 px in light and dark.
- The workflow updates the data daily and deploys `public/` to GitHub Pages.

## Not now

Other countries, other products, alerts, accounts. Add them when the site proves useful.
