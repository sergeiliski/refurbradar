import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FACTORS, factorsWithData, rank } from '../public/scoring.js';

const listing = (id, fields) => ({
  id, grade: 'Good', gen: 4, tier: 'pro', ram: 16, ssd: 512, year: 2024, battery: null,
  ...fields,
  history: [['2026-11-23', fields.price]],
});
const cheap = listing('cheap', { price: 1200, tier: 'base' });
const fast = listing('fast', { price: 2900, tier: 'max', ram: 48 });
const only = (key) => Object.fromEntries(FACTORS.map((f) => [f.key, f.key === key ? 10 : 0]));

test('price weight puts the cheapest first', () => {
  assert.deepEqual(rank([fast, cheap], only('price')).map((r) => r.listing.id), ['cheap', 'fast']);
});

test('chip weight puts the Max first', () => {
  assert.deepEqual(rank([cheap, fast], only('chip')).map((r) => r.listing.id), ['fast', 'cheap']);
});

test('the best listing on the only weighted factor scores 100, the worst 0', () => {
  assert.deepEqual(rank([cheap, fast], only('ram')).map((r) => [r.listing.id, r.score]), [['fast', 100], ['cheap', 0]]);
});

test('with every fader at zero, the cheaper listing comes first', () => {
  assert.deepEqual(rank([fast, cheap], only('nothing')).map((r) => [r.listing.id, r.score]), [['cheap', 0], ['fast', 0]]);
});

test('factorsWithData skips factors every listing shares', () => {
  const keys = factorsWithData([cheap, fast]);
  assert.ok(keys.has('price') && keys.has('chip') && keys.has('ram'));
  assert.ok(!keys.has('battery') && !keys.has('year') && !keys.has('grade'));
});
