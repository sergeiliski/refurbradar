// Geekbench 6.7 CPU averages [single-core, multi-core] per chip generation, tier and CPU core
// count, from Notebookcheck's Mobile Processors Benchmark List, read 25 Nov 2026:
// https://www.notebookcheck.net/Mobile-Processors-Benchmark-List.2436.0.html
const GEEKBENCH_6 = {
  '1:base:8': [2363, 8622],
  '1:pro:8': [2373, 10858],
  '1:pro:10': [2409, 12440],
  '1:max:10': [2442, 12994],
  '2:base:8': [2599, 10089],
  '2:pro:10': [2668, 12943],
  '2:pro:12': [2663, 14568],
  '2:max:12': [2692, 14863],
  '3:base:8': [3054, 11966],
  '3:pro:11': [3113, 14412],
  '3:pro:12': [3138, 15480],
  '3:max:14': [2847, 17576],
  '3:max:16': [3126.5, 21253.5],
  '4:base:10': [3748.5, 14987.5],
  '4:pro:12': [3844, 20458],
  '4:pro:14': [3881.5, 22526.5],
  '4:max:14': [4004, 23384],
  '4:max:16': [3880, 25760],
  '5:base:10': [4195, 17072],
  '5:pro:15': [4302, 25892],
  '5:pro:18': [4297.5, 28897.5],
  '5:max:18': [4322, 29256],
};

/** Geekbench 6 scores for a listing's exact chip, or null when that chip isn't in the table. */
export function cpuScores({ gen, tier, cpu }) {
  const scores = GEEKBENCH_6[`${gen}:${tier}:${cpu}`];
  return scores ? { single: scores[0], multi: scores[1] } : null;
}

/** How a score compares with a baseline, in words: "47% faster", "3% slower", "2.3× faster". */
export function describe(value, base) {
  const ratio = value / base;
  if (ratio >= 2) return `${ratio.toFixed(1)}× faster`;
  const percent = Math.round((ratio - 1) * 100);
  if (percent === 0) return 'same speed';
  return `${Math.abs(percent)}% ${percent > 0 ? 'faster' : 'slower'}`;
}
