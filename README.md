# Refurb Radar

Every refurbished Apple silicon MacBook Pro on Back Market UK, ranked by what you care about.

Eight faders set how much each thing matters: price, condition, chip, memory, storage, battery,
model year and recent price drop. The list re-sorts as you move them, the top pick says why it
won, and every listing carries its price history, so a real drop stands out from the usual price.

## How it works

```
GitHub Actions, every day
└── scripts/update.js
    ├── searches Back Market UK for every M1 to M5 chip and screen size, then a rotating
    │   slice of the memory and storage options those configurations are sold with
    ├── lib/listings.js makes one listing per configuration and grade (and new-battery option)
    └── merges the scan into public/data.json, one price point per listing per day

GitHub Pages serves public/, a static page that ranks data.json in the browser
```

There's no server and no database. The price history is a JSON file the workflow commits.

Each search is its own Apify run, capped at one result, so the money goes on MacBook Pro data
only. When Back Market can't match a search it shows other products instead (a chip it doesn't
sell brings up iPhones), and the cap keeps that to a single result.

## Scoring

Each factor becomes a value from 0 to 1, then counts as much as its fader says. Condition and
battery use the fixed values below; the rest are scaled across the listings on screen, so the
cheapest listing in view gets 1 for price.

```
score = Σ(weight × value) / Σ weight × 100
```

| Fader      | Value                                                     |
| ---------- | --------------------------------------------------------- |
| Price      | cheapest 1, most expensive 0                               |
| Condition  | Fair 0, Good 0.45, Excellent 0.8, Premium 1                |
| Chip       | generation plus a bonus for Pro (+2) or Max (+3.5)          |
| Memory     | log₂ of RAM, so 16 to 32 GB counts as much as 32 to 64 GB    |
| Storage    | log₂ of SSD size                                           |
| Battery    | new battery 1, otherwise 0.5                               |
| Newer      | model year                                                 |
| Price drop | how far the price sits below the highest price seen        |

Screen size and budget are filters rather than faders, because bigger and pricier aren't better
for everyone. A fader whose data every listing shares (battery, when no listing offers a new one) is
dimmed and left out of the score.

## Running it

Node 22.9 or newer. There are no dependencies to install.

```bash
npm test          # unit tests
npm run dev       # the site on http://localhost:4747
npm run update    # fetch fresh listings, using APIFY_TOKEN from .env
```

## Deploying

1. Push the repository to GitHub.
2. Under Settings > Secrets and variables > Actions, add your Apify token as `APIFY_TOKEN`.
3. Under Settings > Pages, set the source to GitHub Actions.
4. Under Actions > Update deals, run the workflow once to fill the site.

From then on it updates itself every day at 06:00 UTC.

## Cost

The Actor ([datascrapers/backmarket-scraper](https://apify.com/datascrapers/backmarket-scraper))
charges $0.003 per result with product details on Apify's free plan. `DAILY_BUDGET_USD` in
`scripts/update.js` is $0.15: the 25 chip searches, then as many memory and storage searches as
the rest buys, starting at a different one each day so they all come round within a few days.
Every run has its own hard spending limit. 31 days come to $4.65, inside the free plan's $5
monthly credit as long as nothing else on the account uses it. Because of the rotation, a
listing counts as for sale while it has been seen in the last seven days.

## Layout

```
lib/        listings.js  parsing, validation and price history
            apify.js     a small Apify API client
scripts/    update.js    the daily fetch
            serve.js     local dev server
public/     index.html, styles.css, app.js, scoring.js and data.json: the whole site
test/       unit tests, run with node:test
```

Listings come from Back Market UK through a third-party Apify scraper. Refurb Radar isn't
affiliated with Back Market.
