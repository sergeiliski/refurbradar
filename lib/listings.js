const UK = 'https://www.backmarket.co.uk';

/**
 * Reads MacBook Pro specs from a product name or URL slug, such as
 * `MacBook Pro 14-inch (2024) - Apple M4 Max 16-core and 40-core GPU - 64GB RAM - SSD 1000GB`.
 * Every field has its own pattern because Back Market orders the parts differently across years.
 */
export function parseSpecs(text) {
  const s = `-${String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-`;
  if (!s.includes('-macbook-pro-')) return null;

  const first = (pattern) => Number(s.match(pattern)?.slice(1).find(Boolean)) || null;
  const chip = s.match(/-m(\d)-(pro|max)-/) ?? s.match(/-m(\d)-(?!series-)/);
  const ssd = s.match(/-ssd-(\d+)-?(gb|tb)-/);

  return {
    size: first(/-(1[3-6])(?:-?\d)?-?inch-/),
    year: first(/-(20[1-3]\d)-/),
    gen: chip ? Number(chip[1]) : 0,
    tier: chip ? (chip[2] ?? 'base') : 'intel',
    ram: first(/-(\d+)-?gb-ram-|-ram-(\d+)-?gb-|-(\d{1,2})-?gb-(?:ssd|hdd|fusion)-/),
    ssd: ssd ? Number(ssd[1]) * (ssd[2] === 'tb' ? 1000 : 1) : null,
    nano: s.includes('-nano-texture-'),
  };
}

const optionGroup = (record, id) => record.variants?.find((group) => group.id === id)?.items ?? [];
const forSale = (item) => item.available && Number(item.price) > 0;

/**
 * The offers a product page lists for its exact configuration: one per available grade, plus the
 * new-battery option when Back Market has one. When a configuration isn't sold in some grade, the
 * picker offers the nearest other product instead, so options for other products are left out.
 * Records without product details only carry the price shown on the search card.
 */
function offersFor(record) {
  const own = (item) => forSale(item) && item.productId === record.productId;
  const grades = optionGroup(record, 'grades').filter(own);
  const newBattery = optionGroup(record, 'battery').filter((item) => own(item) && /new/i.test(item.label));
  if (grades.length === 0) return [{ grade: record.grade, gradeValue: record.gradeValue, price: record.price, battery: null }];
  return [
    ...grades.map((item) => ({ ...item, battery: null })),
    ...newBattery.map((item) => ({ ...item, battery: 'new' })),
  ];
}

/** Turns datascrapers records into listings: one per configuration, grade and battery option. */
export function toListings(records) {
  const listings = new Map();

  for (const record of records) {
    const specs = parseSpecs(record.name);
    if (record.currency !== 'GBP' || !record.productId || !specs?.ram || !specs.ssd) continue;

    for (const offer of offersFor(record)) {
      const id = `${record.productId}:${offer.grade}${offer.battery ? ':new-battery' : ''}`;
      listings.set(id, {
        id,
        url: `${UK}/en-gb/p/${record.url.split('/').pop()}/${record.productId}?l=${offer.gradeValue}`,
        ...specs,
        grade: offer.grade,
        battery: offer.battery,
        price: Number(offer.price),
      });
    }
  }
  return [...listings.values()];
}

const chipQuery = ({ gen, tier }) => (gen ? `m${gen}${tier === 'base' ? '' : ` ${tier}`}` : '');
const capacityQuery = (label) => {
  const gb = Number(label.match(/\d+/)?.[0]);
  return gb >= 1000 ? `${gb / 1000}tb` : `${gb}gb`;
};

/**
 * Searches for the memory and storage options a product page offers next to its own
 * configuration, such as `macbook pro m4 max 16 inch 128gb`, to reach higher-spec machines.
 */
export function followUpQueries(records) {
  const queries = new Set();
  for (const record of records) {
    const specs = parseSpecs(record.name);
    if (!specs?.gen || !specs.size) continue;
    for (const item of [...optionGroup(record, 'memory'), ...optionGroup(record, 'storage')]) {
      if (forSale(item) && !item.selected) {
        queries.add(`macbook pro ${chipQuery(specs)} ${specs.size} inch ${capacityQuery(item.label)}`);
      }
    }
  }
  return [...queries];
}

/** Picks `count` queries, starting at a different place each day so every query comes round. */
export function dailySlice(queries, count, day) {
  const sorted = [...queries].sort();
  const start = sorted.length ? (day * count) % sorted.length : 0;
  return [...sorted.slice(start), ...sorted.slice(0, start)].slice(0, count);
}

/**
 * Adds a scan to the stored data. Each listing keeps one price point per day: a second scan on
 * the same day replaces that day's point instead of adding another.
 */
export function mergeScan(data, listings, at = new Date().toISOString()) {
  const day = at.slice(0, 10);
  const next = { listings: { ...data.listings }, scans: [...data.scans, { at, count: listings.length }] };

  for (const listing of listings) {
    const previous = next.listings[listing.id];
    const history = (previous?.history ?? []).filter(([date]) => date !== day);
    next.listings[listing.id] = {
      ...listing,
      history: [...history, [day, listing.price]],
      firstSeen: previous?.firstSeen ?? day,
      lastSeen: day,
    };
  }
  return next;
}
