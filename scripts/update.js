import { readFile, writeFile } from 'node:fs/promises';
import { runActor } from '../lib/apify.js';
import { dailySlice, followUpQueries, mergeScan, toListings } from '../lib/listings.js';

const ACTOR = 'datascrapers/backmarket-scraper';
const USD_PER_SEARCH = 0.003; // one result with product details, on Apify's free plan
const DAILY_BUDGET_USD = 0.15; // 31 days come to $4.65, inside the free plan's $5 a month
const PARALLEL_RUNS = 4; // each run takes 4 GB; the free plan allows 16 GB at once
const DATA_FILE = new URL('../public/data.json', import.meta.url);

const CHIP_QUERIES = ['m1', 'm2', 'm3', 'm4', 'm5'].flatMap((m) =>
  [`${m} ${m === 'm1' || m === 'm2' ? 13 : 14}`, `${m} pro 14`, `${m} pro 16`, `${m} max 14`, `${m} max 16`]
    .map((chip) => `macbook pro ${chip}`),
);

const token = process.env.APIFY_TOKEN;
if (!token) {
  console.error('APIFY_TOKEN is missing. Copy .env.example to .env and add your Apify API token.');
  process.exit(1);
}

/**
 * Runs each search as its own Actor run, capped at one result. When Back Market has no match it
 * falls back to unrelated products (iPhones, for a chip it doesn't sell), and the cap keeps that
 * to a single wasted result.
 */
async function searchEach(queries) {
  const results = [];
  for (let i = 0; i < queries.length; i += PARALLEL_RUNS) {
    const batch = queries.slice(i, i + PARALLEL_RUNS);
    const outcomes = await Promise.allSettled(batch.map((query) => runActor(ACTOR, {
      startUrls: [{ url: `https://www.backmarket.co.uk/en-gb/search?q=${encodeURIComponent(query)}` }],
      maxItems: 1,
      includeProductDetails: true,
    }, { token, maxChargeUsd: USD_PER_SEARCH + 0.001 })));

    outcomes.forEach((outcome, j) => {
      if (outcome.status === 'fulfilled') results.push(...outcome.value);
      else console.warn(`Search "${batch[j]}" failed: ${outcome.reason.message}`);
    });
  }
  return results;
}

console.log(`Searching ${CHIP_QUERIES.length} chips and screen sizes…`);
const chipResults = await searchEach(CHIP_QUERIES);

const optionCount = Math.floor((DAILY_BUDGET_USD - CHIP_QUERIES.length * USD_PER_SEARCH) / USD_PER_SEARCH);
const optionQueries = dailySlice(followUpQueries(chipResults), optionCount, Math.floor(Date.now() / 86_400_000));
console.log(`Searching ${optionQueries.length} memory and storage options…`);
const optionResults = await searchEach(optionQueries);

const listings = toListings([...chipResults, ...optionResults]);
if (listings.length === 0) {
  throw new Error('Back Market returned no MacBook Pro configurations. Check toListings() in lib/listings.js.');
}

const data = JSON.parse(await readFile(DATA_FILE, 'utf8'));
await writeFile(DATA_FILE, `${JSON.stringify(mergeScan(data, listings), null, 2)}\n`);
console.log(`Saved ${listings.length} listings from ${chipResults.length + optionResults.length} results.`);
