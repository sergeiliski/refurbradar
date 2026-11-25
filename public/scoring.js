const GRADE_VALUE = { Fair: 0, Good: 0.45, Excellent: 0.8, Premium: 1 };
const TIER_BONUS = { intel: 0, base: 0, pro: 2, max: 3.5 };

const peakPrice = (listing) => Math.max(...listing.history.map(([, price]) => price));

export const FACTORS = [
  { key: 'price', label: 'Price', short: 'Price', value: (l) => -l.price },
  { key: 'grade', label: 'Condition', short: 'Grade', value: (l) => GRADE_VALUE[l.grade], prescaled: true },
  { key: 'chip', label: 'Chip', short: 'Chip', value: (l) => l.gen + TIER_BONUS[l.tier] },
  { key: 'ram', label: 'Memory', short: 'RAM', value: (l) => Math.log2(l.ram ?? 8) },
  { key: 'ssd', label: 'Storage', short: 'SSD', value: (l) => Math.log2(l.ssd ?? 256) },
  { key: 'battery', label: 'Battery', short: 'Battery', value: (l) => (l.battery === 'new' ? 1 : 0.5), prescaled: true },
  { key: 'year', label: 'Newer', short: 'Year', value: (l) => l.year ?? 2016 },
  { key: 'drop', label: 'Price drop', short: 'Drop', value: (l) => (peakPrice(l) - l.price) / peakPrice(l) },
];

export const PRESETS = {
  balanced: { price: 6, grade: 6, chip: 6, ram: 6, ssd: 4, battery: 4, year: 4, drop: 3 },
  power: { price: 3, grade: 5, chip: 10, ram: 9, ssd: 7, battery: 4, year: 6, drop: 2 },
  budget: { price: 10, grade: 5, chip: 4, ram: 4, ssd: 2, battery: 5, year: 3, drop: 6 },
};

/** Scores listings from 0 to 100 and sorts them best first. Ties go to the cheaper listing. */
export function rank(listings, weights) {
  const scaled = FACTORS.map(({ key, value, prescaled }) => {
    if (prescaled) return { key, value };
    const values = listings.map(value);
    const low = Math.min(...values);
    const high = Math.max(...values);
    return { key, value: (l) => (high > low ? (value(l) - low) / (high - low) : 0.5) };
  });
  const totalWeight = scaled.reduce((sum, { key }) => sum + weights[key], 0) || 1;

  return listings
    .map((listing) => {
      const parts = scaled.map(({ key, value }) => ({ key, points: weights[key] * value(listing) }));
      const score = (parts.reduce((sum, part) => sum + part.points, 0) / totalWeight) * 100;
      return { listing, parts, score };
    })
    .sort((a, b) => b.score - a.score || a.listing.price - b.listing.price);
}

/** Factors whose value differs between listings. The rest can't change the ranking. */
export function factorsWithData(listings) {
  return new Set(FACTORS.filter((f) => new Set(listings.map(f.value)).size > 1).map((f) => f.key));
}
