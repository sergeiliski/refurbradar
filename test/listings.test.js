import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailySlice, followUpQueries, mergeScan, parseSpecs, toListings } from '../lib/listings.js';

const M2_ID = 'ef20e8dd-bcbf-4d94-8933-15f59560b9b9';
const option = (label, price, grade, gradeValue, flags = {}) => ({
  label, price, grade, gradeValue, productId: M2_ID, currency: 'GBP', available: price != null, selected: false, ...flags,
});

// Trimmed from a real datascrapers/backmarket-scraper result for Back Market UK, 25 Nov 2026.
const m2 = (overrides = {}) => ({
  productId: M2_ID,
  name: 'MacBook Pro 13-inch (2022) - Apple M2 8-core and 10-core GPU - 8GB RAM - SSD 256GB - Standard display - QWERTY - English',
  url: 'https://www.backmarket.co.uk/en-gb/p/macbook-pro-m2-series',
  price: 554,
  currency: 'GBP',
  grade: 'Fair',
  gradeValue: 12,
  variants: [
    { id: 'grades', items: [option('Fair', 554, 'Fair', 12, { selected: true }), option('Good', 728, 'Good', 11), option('Excellent', 750, 'Excellent', 10)] },
    { id: 'memory', items: [option('8 GB', 554, 'Fair', 12, { selected: true }), option('16 GB', 799, 'Fair', 12), option('24 GB', null)] },
    { id: 'storage', items: [option('256 GB', 554, 'Fair', 12, { selected: true }), option('512 GB', 735, 'Fair', 12), option('1000 GB', null)] },
  ],
  ...overrides,
});

test('parseSpecs reads product names', () => {
  assert.deepEqual(parseSpecs(m2().name), { size: 13, year: 2022, gen: 2, tier: 'base', ram: 8, ssd: 256, nano: false });
  const max = parseSpecs('MacBook Pro 16-inch (2024) - Apple M4 Max 16-core and 40-core GPU - 64GB RAM - SSD 1000GB - Standard display');
  assert.deepEqual([max.size, max.gen, max.tier, max.ram, max.ssd], [16, 4, 'max', 64, 1000]);
});

test('parseSpecs reads product slugs, including Intel ones', () => {
  const pro = parseSpecs('macbook-pro-14-inch-2026-m5-pro-15-core-and-16-core-gpu-24gb-ram-ssd-1000gb-nano-texture-display');
  assert.deepEqual([pro.size, pro.year, pro.gen, pro.tier, pro.ram, pro.ssd, pro.nano], [14, 2026, 5, 'pro', 24, 1000, true]);
  const intel = parseSpecs('macbook-pro-retina-133-inch-2019-core-i7-16gb-ssd-256-gb-qwerty-english-us');
  assert.deepEqual([intel.size, intel.year, intel.tier, intel.ram, intel.ssd], [13, 2019, 'intel', 16, 256]);
});

test('parseSpecs leaves out what is not a configured MacBook Pro', () => {
  assert.equal(parseSpecs('MacBook Pro (M1 series)').ram, null);
  assert.equal(parseSpecs('Cover MacBook Pro 14" (2021-2023) - Polyester - Black').ram, null);
  assert.equal(parseSpecs('MacBook Air 13-inch (2024) - Apple M3 - 8GB RAM - SSD 256GB'), null);
});

test('toListings makes one listing per available grade, linked to that grade', () => {
  const listings = toListings([m2()]);
  assert.deepEqual(listings.map((l) => [l.grade, l.price]), [['Fair', 554], ['Good', 728], ['Excellent', 750]]);
  assert.equal(listings[1].id, 'ef20e8dd-bcbf-4d94-8933-15f59560b9b9:Good');
  assert.equal(listings[1].url, 'https://www.backmarket.co.uk/en-gb/p/macbook-pro-m2-series/ef20e8dd-bcbf-4d94-8933-15f59560b9b9?l=11');
});

test('toListings adds the new-battery option when it is for sale', () => {
  const battery = { id: 'battery', items: [option('Standard battery', 554, 'Fair', 12, { selected: true }), option('New battery', 640, 'Fair', 12)] };
  const listing = toListings([m2({ variants: [...m2().variants, battery] })]).find((l) => l.battery === 'new');
  assert.deepEqual([listing.id, listing.price], ['ef20e8dd-bcbf-4d94-8933-15f59560b9b9:Fair:new-battery', 640]);
});

test('toListings leaves out grade and battery options that belong to another product', () => {
  // Real case: an M5 4 TB page offered Good at £1,575 and a new battery at £1,750, both for cheaper M5s.
  const elsewhere = { productId: '9ad04fc3-6949-445b-a777-a0c805ac5ae0' };
  const variants = [
    { id: 'grades', items: [option('Fair', 554, 'Fair', 12, { selected: true }), option('Good', 499, 'Good', 11, elsewhere)] },
    { id: 'battery', items: [option('New battery', 450, 'Fair', 12, elsewhere)] },
  ];
  assert.deepEqual(toListings([m2({ variants })]).map((l) => [l.grade, l.price, l.battery]), [['Fair', 554, null]]);
});

test('toListings falls back to the search card price without product details', () => {
  assert.deepEqual(toListings([m2({ variants: undefined })]).map((l) => [l.grade, l.price]), [['Fair', 554]]);
});

test('toListings skips accessories, series cards and other currencies', () => {
  assert.equal(toListings([m2({ name: 'MacBook Pro (M2 series)' }), m2({ currency: 'EUR' })]).length, 0);
});

test('followUpQueries searches for the other memory and storage options on sale', () => {
  assert.deepEqual(followUpQueries([m2()]), ['macbook pro m2 13 inch 16gb', 'macbook pro m2 13 inch 512gb']);
});

test('dailySlice moves on each day and wraps round, so every query gets its turn', () => {
  const queries = ['e', 'a', 'd', 'b', 'c'];
  assert.deepEqual(dailySlice(queries, 2, 0), ['a', 'b']);
  assert.deepEqual(dailySlice(queries, 2, 1), ['c', 'd']);
  assert.deepEqual(dailySlice(queries, 2, 2), ['e', 'a']);
  assert.deepEqual(dailySlice(queries, 9, 3), ['c', 'd', 'e', 'a', 'b']);
  assert.deepEqual(dailySlice([], 2, 5), []);
});

test('mergeScan keeps one price point per day and remembers first sight', () => {
  const [listing] = toListings([m2()]);
  let data = { listings: {}, scans: [] };
  data = mergeScan(data, [listing], '2026-11-16T06:00:00Z');
  data = mergeScan(data, [{ ...listing, price: 529 }], '2026-11-16T18:00:00Z');
  data = mergeScan(data, [{ ...listing, price: 499 }], '2026-11-23T06:00:00Z');

  const stored = data.listings[listing.id];
  assert.deepEqual(stored.history, [['2026-11-16', 529], ['2026-11-23', 499]]);
  assert.equal(stored.firstSeen, '2026-11-16');
  assert.equal(stored.lastSeen, '2026-11-23');
  assert.equal(data.scans.length, 3);
});
