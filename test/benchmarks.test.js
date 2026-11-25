import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpuScores, describe } from '../public/benchmarks.js';

test('cpuScores matches the exact chip and core count', () => {
  assert.deepEqual(cpuScores({ gen: 3, tier: 'max', cpu: 14 }), { single: 2847, multi: 17576 });
  assert.deepEqual(cpuScores({ gen: 5, tier: 'base', cpu: 10 }), { single: 4195, multi: 17072 });
  assert.equal(cpuScores({ gen: 5, tier: 'pro', cpu: 16 }), null);
});

test('describe puts a score against a baseline in words', () => {
  assert.equal(describe(4195, 2847), '47% faster');
  assert.equal(describe(17072, 17576), '3% slower');
  assert.equal(describe(29256, 8622), '3.4× faster');
  assert.equal(describe(100, 100.2), 'same speed');
});
