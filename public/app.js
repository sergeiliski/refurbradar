import { FACTORS, PRESETS, factorsWithData, rank } from './scoring.js';

const $ = (selector, root = document) => root.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const WEIGHTS_KEY = 'refurbradar:weights';
const THEME_KEY = 'refurbradar:theme';
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const FOR_SALE_DAYS = 7; // option searches rotate daily, so a listing can go a few days unseen

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format;
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const andList = new Intl.ListFormat('en-GB', { type: 'conjunction' });
const relative = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });

const state = {
  data: { listings: {}, scans: [] },
  weights: loadWeights(),
  available: new Set(FACTORS.map((f) => f.key)),
  size: 'any',
  gens: new Set(),
  tiers: new Set(),
  budget: Infinity,
  showSold: false,
  heroId: null,
};

const escapeHtml = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const chipName = ({ gen, tier }) => (gen ? `M${gen}${{ pro: ' Pro', max: ' Max' }[tier] ?? ''}` : 'Intel');

const storage = (gb) => (gb == null ? 'Unknown storage' : gb >= 1000 ? `${gb / 1000} TB` : `${gb} GB`);

const formatDay = (isoDay) => shortDate.format(new Date(isoDay));

function timeAgo(iso) {
  const minutes = Math.min(0, Math.round((new Date(iso) - Date.now()) / 60_000));
  if (minutes > -60) return relative.format(minutes, 'minute');
  if (minutes > -48 * 60) return relative.format(Math.round(minutes / 60), 'hour');
  return relative.format(Math.round(minutes / (24 * 60)), 'day');
}

function loadWeights() {
  try {
    const saved = JSON.parse(localStorage.getItem(WEIGHTS_KEY));
    if (FACTORS.every(({ key }) => Number.isFinite(saved?.[key]))) return saved;
  } catch {
    // Storage can be blocked (private windows, strict settings); the defaults still work.
  }
  return { ...PRESETS.balanced };
}

function remember(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Same as above: the page works without remembering.
  }
}

const saveWeights = () => remember(WEIGHTS_KEY, JSON.stringify(state.weights));

/** Weights as the ranking sees them: factors without data count for nothing. */
const effectiveWeights = () =>
  Object.fromEntries(FACTORS.map(({ key }) => [key, state.available.has(key) ? state.weights[key] : 0]));

function sparkline(history, { width = 80, height = 24, className = 'spark' } = {}) {
  const prices = history.map(([, price]) => price);
  if (prices.length < 2) return `<svg class="${className}" width="${width}" height="${height}" aria-hidden="true"></svg>`;

  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const y = (price) => (high === low ? height / 2 : 2 + ((high - price) / (high - low)) * (height - 4));
  const points = prices.map((price, i) => `${((i / (prices.length - 1)) * width).toFixed(1)},${y(price).toFixed(1)}`);
  return `<svg class="${className}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"
    preserveAspectRatio="none" aria-hidden="true"><polyline points="${points.join(' ')}"/></svg>`;
}

function priceChange({ history, price }) {
  if (history.length < 2) return { className: '', text: '' };
  const first = history[0][1];
  const percent = Math.round(((price - first) / first) * 100);
  if (percent === 0) return { className: '', text: '0%' };
  return { className: percent < 0 ? 'is-down' : 'is-up', text: `${percent < 0 ? '−' : '+'}${Math.abs(percent)}%` };
}

function historyNote({ history, price }) {
  const [firstDay, firstPrice] = history[0];
  if (history.length < 2) return `First seen ${formatDay(firstDay)}. The price history grows with each daily update.`;

  const difference = price - firstPrice;
  const lowest = Math.min(...history.map(([, p]) => p));
  const versusFirst = difference
    ? `${gbp(Math.abs(difference))} ${difference < 0 ? 'less' : 'more'} than when first seen on ${formatDay(firstDay)}.`
    : `Same price as when first seen on ${formatDay(firstDay)}.`;
  return lowest < price ? `${versusFirst} Lowest seen ${gbp(lowest)}.` : versusFirst;
}

function renderStatus(forSale) {
  const lastScan = state.data.scans.at(-1);
  $('#status').textContent = lastScan
    ? `${forSale} MacBook Pros for sale, updated ${timeAgo(lastScan.at)}`
    : 'Waiting for the first update';
}

function renderHero(best, hasListings, weights) {
  const hero = $('#hero');

  if (!best) {
    hero.innerHTML = hasListings
      ? `<div class="hero-empty"><h1 class="display">Nothing matches</h1>
          <p>Set Chip and Screen to Any, or raise the max price.</p></div>`
      : `<div class="hero-empty"><h1 class="display">No listings yet</h1>
          <p>The first daily update hasn’t run. Run <code>npm run update</code>, or start the Update deals workflow on GitHub.</p></div>`;
    state.heroId = null;
    return;
  }

  const { listing, parts, score } = best;
  const labels = Object.fromEntries(FACTORS.map(({ key, label }) => [key, label.toLowerCase()]));
  const strengths = parts
    .filter(({ key }) => weights[key] > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map(({ key }) => labels[key]);

  hero.innerHTML = `
    <div>
      <h1 class="display">${chipName(listing)} ${listing.size ?? ''}″
        <small>MacBook Pro ${listing.year ?? ''}${listing.nano ? ', nano-texture display' : ''}</small></h1>
      <ul class="specs">
        <li>${listing.ram ?? '?'} GB memory</li>
        <li>${storage(listing.ssd)}</li>
        <li>${listing.grade}</li>
        ${listing.battery === 'new' ? '<li>New battery</li>' : ''}
      </ul>
      <p class="reason">Your best match, scoring ${Math.round(score)} of 100.${
        strengths.length ? ` Strongest on ${andList.format(strengths)}.` : ''
      }</p>
      <a class="button" href="${escapeHtml(listing.url)}" target="_blank" rel="noopener">View on Back Market</a>
    </div>
    <div>
      <p class="display">${gbp(listing.price)}</p>
      <p class="history-note">${historyNote(listing)}</p>
      ${sparkline(listing.history, { width: 300, height: 72, className: 'chart' })}
    </div>`;

  if (state.heroId && state.heroId !== listing.id && !reducedMotion.matches) {
    hero.animate([{ opacity: 0.35, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], {
      duration: 260,
      easing: 'ease-out',
    });
  }
  state.heroId = listing.id;
}

function rowMarkup({ listing, score }, index) {
  const change = priceChange(listing);
  return `
    <span class="row-rank">${index + 1}</span>
    <a class="row-name" href="${escapeHtml(listing.url)}" target="_blank" rel="noopener">
      ${chipName(listing)} ${listing.size ?? ''}″ <small>${listing.year ?? ''}</small></a>
    <span class="row-config">${listing.ram ?? '?'} GB, ${storage(listing.ssd)}${listing.battery === 'new' ? ', new battery' : ''}</span>
    <span class="row-grade">${listing.grade}</span>
    <span class="score" style="--score: ${score.toFixed(1)}%"><i></i><b>${Math.round(score)}</b></span>
    <span class="row-price">${gbp(listing.price)}</span>
    <span class="row-change ${change.className}">${change.text}</span>
    ${sparkline(listing.history)}`;
}

const rowElements = new Map();

function renderRows(ranked) {
  const list = $('#rows');
  const before = new Map([...list.children].map((row) => [row.dataset.id, row.getBoundingClientRect().top]));

  ranked.forEach((entry, index) => {
    let row = rowElements.get(entry.listing.id);
    if (!row) {
      row = document.createElement('li');
      row.className = 'row';
      row.dataset.id = entry.listing.id;
      rowElements.set(entry.listing.id, row);
    }
    row.innerHTML = rowMarkup(entry, index);
    row.classList.toggle('is-top', index === 0);
    list.append(row);
  });

  const shown = new Set(ranked.map(({ listing }) => listing.id));
  for (const [id, row] of rowElements) {
    if (!shown.has(id)) {
      row.remove();
      rowElements.delete(id);
    }
  }

  if (reducedMotion.matches) return;
  const onScreen = (y) => y > -100 && y < innerHeight + 100;
  for (const row of list.children) {
    const was = before.get(row.dataset.id);
    const now = row.getBoundingClientRect().top;
    if (was === undefined || was === now || !(onScreen(was) || onScreen(now))) continue;
    row.animate([{ transform: `translateY(${was - now}px)` }, { transform: 'none' }], {
      duration: 380,
      easing: 'cubic-bezier(.2, .8, .2, 1)',
    });
  }
}

function render() {
  const all = Object.values(state.data.listings);
  const latestDay = all.reduce((latest, l) => (l.lastSeen > latest ? l.lastSeen : latest), '');
  const forSale = all.filter((l) => Date.parse(latestDay) - Date.parse(l.lastSeen) < FOR_SALE_DAYS * 86_400_000);
  if (forSale.length) state.available = factorsWithData(forSale);

  const inView = (state.showSold ? all : forSale).filter(
    (l) =>
      (state.gens.size === 0 || state.gens.has(l.gen)) &&
      (state.tiers.size === 0 || state.tiers.has(l.tier)) &&
      (state.size === 'any' || l.size === Number(state.size)) &&
      l.price <= state.budget,
  );
  const weights = effectiveWeights();
  const ranked = rank(inView, weights);

  renderStatus(forSale.length);
  renderHero(ranked[0], all.length > 0, weights);
  renderRows(ranked);
  syncFaders();

  $('#count').textContent = all.length ? `${ranked.length} ${ranked.length === 1 ? 'listing' : 'listings'}` : '';
  const note = $('#empty-note');
  note.hidden = ranked.length > 0;
  note.textContent = all.length ? 'No listings match these filters.' : 'Listings appear here after the first update.';
}

let frame = 0;
const scheduleRender = () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
};

function buildFaders() {
  $('#faders').innerHTML = FACTORS.map(
    ({ key, label, short }) => `
      <label class="fader" id="fader-${key}">
        <output></output>
        <span class="track"><input type="range" min="0" max="10" step="1" data-key="${key}" aria-label="${label}"></span>
        <span class="fader-name"><span class="long">${label}</span><span class="short" aria-hidden="true">${short}</span></span>
      </label>`,
  ).join('');
}

function syncFaders() {
  for (const { key } of FACTORS) {
    const fader = $(`#fader-${key}`);
    const idle = !state.available.has(key);
    fader.classList.toggle('is-idle', idle);
    fader.title = idle ? 'The current listings have no data for this' : '';
    fader.style.setProperty('--level', state.weights[key]);
    $('output', fader).textContent = idle ? '–' : state.weights[key];
    Object.assign($('input', fader), { value: state.weights[key], disabled: idle });
  }
  for (const button of document.querySelectorAll('[data-preset]')) {
    const preset = PRESETS[button.dataset.preset];
    button.setAttribute('aria-pressed', String(FACTORS.every(({ key }) => preset[key] === state.weights[key])));
  }
}

const currentTheme = () => document.documentElement.dataset.theme || (systemDark.matches ? 'dark' : 'light');
const otherTheme = () => (currentTheme() === 'dark' ? 'light' : 'dark');

function syncThemeButton() {
  const label = `Switch to ${otherTheme()} theme`;
  Object.assign($('#theme'), { title: label, ariaLabel: label });
}

function bindControls() {
  $('#theme').addEventListener('click', () => {
    const theme = otherTheme();
    document.documentElement.dataset.theme = theme;
    remember(THEME_KEY, theme);
    syncThemeButton();
  });
  systemDark.addEventListener('change', syncThemeButton);
  $('#faders').addEventListener('input', ({ target }) => {
    state.weights[target.dataset.key] = Number(target.value);
    saveWeights();
    scheduleRender();
  });
  for (const button of document.querySelectorAll('[data-preset]')) {
    button.addEventListener('click', () => {
      state.weights = { ...PRESETS[button.dataset.preset] };
      saveWeights();
      scheduleRender();
    });
  }
  $('#size').addEventListener('change', ({ target }) => {
    state.size = target.value;
    scheduleRender();
  });
  $('#chips').addEventListener('change', syncChipFilter);
  $('#chips-any').addEventListener('click', () => {
    for (const input of document.querySelectorAll('#chips input')) input.checked = false;
    syncChipFilter();
  });
  $('#budget').addEventListener('input', ({ target }) => {
    state.budget = Number(target.value) > 0 ? Number(target.value) : Infinity;
    scheduleRender();
  });
  $('#show-sold').addEventListener('change', ({ target }) => {
    state.showSold = target.checked;
    scheduleRender();
  });
}

/**
 * One pill per chip generation and per Pro or Max tier in the data, so a new generation shows up
 * without a code change. Nothing selected in a row means any.
 */
function buildChipFilter(listings) {
  const gens = [...new Set(listings.map((l) => l.gen))].sort((a, b) => a - b);
  const tiers = ['pro', 'max'].filter((tier) => listings.some((l) => l.tier === tier));
  const pill = (kind, value, label) =>
    `<input type="checkbox" id="${kind}-${value}" data-kind="${kind}" value="${value}"><label class="pill" for="${kind}-${value}">${label}</label>`;
  $('#chips').insertAdjacentHTML('beforeend', [
    ...gens.map((gen) => pill('gen', gen, gen ? `M${gen}` : 'Intel')),
    tiers.length ? '<span class="divider" aria-hidden="true"></span>' : '',
    ...tiers.map((tier) => pill('tier', tier, tier === 'pro' ? 'Pro' : 'Max')),
  ].join(''));
}

function syncChipFilter() {
  const checked = (kind) => [...document.querySelectorAll(`#chips input[data-kind="${kind}"]:checked`)].map((input) => input.value);
  state.gens = new Set(checked('gen').map(Number));
  state.tiers = new Set(checked('tier'));
  $('#chips-any').setAttribute('aria-pressed', String(state.gens.size + state.tiers.size === 0));
  scheduleRender();
}

async function loadData() {
  try {
    const response = await fetch('data.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`data.json returned ${response.status}`);
    state.data = await response.json();
    buildChipFilter(Object.values(state.data.listings));
  } catch (error) {
    $('#status').textContent = `Couldn’t load listings (${error.message}).`;
  }
  render();
}

buildFaders();
bindControls();
syncThemeButton();
loadData();
