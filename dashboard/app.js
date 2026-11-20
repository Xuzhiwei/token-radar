// Token Radar dashboard. Reads window.RADAR_DATA (written beside this page
// by main.ts from the sealed snapshot) and renders the board, the filters
// and the per-protocol detail view. No network, no framework.
//
// The model the page explains (lib/model.ts builds it):
//   implied = TVL x category multiple x momentum x maturity x breadth
// where the multiple is the median market-cap/TVL of the category's traded
// protocols, shrunk toward the global median; momentum comes from the 7d
// TVL change, maturity from days listed with no token, breadth from the
// chain count. Trading protocols are carried at recorded market cap.

'use strict';

const DATA = window.RADAR_DATA;
const rows = DATA.rows;
const stats = DATA.stats;
const params = new URLSearchParams(location.search);

const state = {
  q: params.get('q') || '',
  cat: params.get('cat') || '',
  chain: params.get('chain') || '',
  status: params.get('status') || 'pre',
  watch: params.get('watch') === '1',
  sort: params.get('sort') || 'implied',
  slug: params.get('slug') || '',
};

const $ = (id) => document.getElementById(id);

function fmtUsd(n) {
  if (n == null) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  if (n >= 100) return '$' + Math.round(n);
  return '$' + (Math.round(n * 100) / 100).toFixed(2);
}
function fmtPct(x) {
  if (x == null) return '—';
  return (x > 0 ? '+' : '') + x.toFixed(1) + '%';
}
function fmtX(x) { return (Math.round(x * 100) / 100).toFixed(2) + 'x'; }

// ------------------------------------------------------------ static parts
function renderChips() {
  const chips = [
    ['Snapshot', stats.as_of],
    ['Protocols scanned', stats.protocol_count],
    ['Pre-token', stats.pre_token_count],
    ['Watchlist covered', stats.watchlist_count + '/' + stats.watchlist_count],
    ['Global median multiple', fmtX(stats.global_median_multiple)],
    ['Total implied (pre-token)', fmtUsd(stats.total_implied_usd)],
  ];
  $('statChips').innerHTML = chips
    .map(([k, v]) => '<div class="chip">' + k + ' <b>' + v + '</b></div>').join('');
}

function renderMultiples() {
  const top = [...stats.multiples]
    .sort((a, b) => b.traded_count - a.traded_count)
    .slice(0, 9);
  $('multipleTable').querySelector('tbody').innerHTML = top.map((m) =>
    '<tr><td>' + m.category + '</td><td>' + m.traded_count + '</td><td>' +
    fmtX(m.median) + '</td><td>' + fmtX(m.applied) + '</td></tr>').join('');
}

function fillSelect(el, values, allLabel) {
  el.innerHTML = '<option value="">' + allLabel + '</option>' + values
    .map((v) => '<option value="' + v.replace(/"/g, '&quot;') + '">' + v + '</option>').join('');
}

function renderControls() {
  const cats = [...new Set(rows.map((r) => r.category))].sort();
  const chainCount = new Map();
  for (const r of rows) for (const c of r.chains) chainCount.set(c, (chainCount.get(c) || 0) + 1);
  const chains = [...chainCount.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  fillSelect($('cat'), cats, 'All categories');
  fillSelect($('chain'), chains, 'All chains');
  $('q').value = state.q;
  $('cat').value = state.cat;
  $('chain').value = state.chain;
  $('watch').checked = state.watch;
  $('sort').value = state.sort;
  document.querySelectorAll('.segmented button').forEach((b) =>
    b.classList.toggle('on', b.dataset.status === state.status));
}

// ------------------------------------------------------------------- board
function filtered() {
  const q = state.q.trim().toLowerCase();
  let out = rows.filter((r) => {
    if (state.status === 'pre' && r.status !== 'pre-token') return false;
    if (state.status === 'trading' && r.status !== 'trading') return false;
    if (state.watch && !r.watchlist) return false;
    if (state.cat && r.category !== state.cat) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.includes(q))) return false;
    return true;
  });
  const by = {
    implied: (a, b) => b.implied_value_usd - a.implied_value_usd,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    change: (a, b) => (b.change_7d ?? -Infinity) - (a.change_7d ?? -Infinity),
    age: (a, b) => (b.days_listed ?? -1) - (a.days_listed ?? -1),
    multiple: (a, b) => b.multiple - a.multiple,
  };
  out.sort(by[state.sort] || by.implied);
  return out;
}

function changeCell(r) {
  if (r.change_7d == null) return '<span class="change flat">—</span>';
  const cls = r.change_7d > 0.05 ? 'up' : r.change_7d < -0.05 ? 'down' : 'flat';
  const w = Math.min(46, Math.max(3, Math.abs(r.change_7d) * 2.2));
  return '<span class="change ' + cls + '">' + fmtPct(r.change_7d) +
    '<span class="bar" style="width:' + w.toFixed(0) + 'px"></span></span>';
}

function renderBoard() {
  const list = filtered();
  const shown = list.slice(0, 400);
  $('rowCount').textContent = 'Showing ' + shown.length + ' of ' + list.length + ' protocols';
  $('boardBody').innerHTML = shown.map((r) => {
    const chains = r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '');
    return '<tr data-slug="' + r.slug + '"' + (r.slug === state.slug ? ' class="selected"' : '') + '>' +
      '<td class="rank num">' + r.rank + '</td>' +
      '<td class="name"><b>' + r.name + '</b>' + (r.watchlist ? '<span class="wl">WATCHLIST</span>' : '') +
      '<span class="slug">' + r.slug + (r.symbol ? ' · ' + r.symbol : '') + '</span></td>' +
      '<td><span class="chip-status ' + (r.status === 'pre-token' ? 'pre' : 'trading') + '">' +
      (r.status === 'pre-token' ? 'PRE-TOKEN' : 'TRADING') + '</span></td>' +
      '<td>' + r.category + '</td>' +
      '<td class="chains">' + chains + '</td>' +
      '<td class="money num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td>' + changeCell(r) + '</td>' +
      '<td class="money num">' + fmtX(r.multiple) + '</td>' +
      '<td class="implied num">' + fmtUsd(r.implied_value_usd) + '</td></tr>';
  }).join('');
}

// ------------------------------------------------------------------ detail
function breakdownRows(r) {
  if (r.status === 'trading') {
    return '<tr><td>Recorded market cap</td><td>' + fmtUsd(r.mcap_usd) + '</td></tr>' +
      '<tr><td>TVL</td><td>' + fmtUsd(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Actual mcap / TVL</td><td>' + fmtX(r.multiple) + '</td></tr>' +
      '<tr class="total"><td>Carried at</td><td>' + fmtUsd(r.implied_value_usd) + '</td></tr>';
  }
  return '<tr><td>TVL</td><td>' + fmtUsd(r.tvl_usd) + '</td></tr>' +
    '<tr><td>&times; category multiple</td><td>' + fmtX(r.multiple) + '</td></tr>' +
    '<tr><td>= base value</td><td>' + fmtUsd(r.base_value_usd) + '</td></tr>' +
    '<tr><td>&times; momentum (7d ' + fmtPct(r.change_7d) + ')</td><td>' + fmtX(r.momentum_factor) + '</td></tr>' +
    '<tr><td>&times; maturity (' + (r.days_listed == null ? 'listing day unknown' : r.days_listed + ' days, no token') + ')</td><td>' + fmtX(r.maturity_factor) + '</td></tr>' +
    '<tr><td>&times; breadth (' + r.chains.length + (r.chains.length === 1 ? ' chain' : ' chains') + ')</td><td>' + fmtX(r.breadth_factor) + '</td></tr>' +
    '<tr class="total"><td>Implied launch value</td><td>' + fmtUsd(r.implied_value_usd) + '</td></tr>';
}

function openDetail(slug) {
  const r = rows.find((x) => x.slug === slug);
  if (!r) return;
  state.slug = slug;
  const figs = [
    ['Status', r.status === 'pre-token' ? 'Pre-token' : 'Trading' + (r.symbol ? ' (' + r.symbol + ')' : '')],
    ['Board rank', '#' + r.rank],
    ['Category', r.category],
    ['Chains', r.chains.join(', ') || '—'],
    ['TVL', fmtUsd(r.tvl_usd)],
    ['7d TVL change', fmtPct(r.change_7d)],
    ['Implied value', fmtUsd(r.implied_value_usd)],
    ['Watchlist', r.watchlist ? 'Yes — house floor' : 'No — found below the floor'],
  ];
  $('detailBody').innerHTML =
    '<h2>' + r.name + '</h2><div class="dslug">' + r.slug + '</div>' +
    '<div class="figgrid">' + figs.map(([k, v]) =>
      '<div class="fig"><span>' + k + '</span><b>' + v + '</b></div>').join('') + '</div>' +
    '<h4>How this value is derived</h4>' +
    '<table class="breakdown">' + breakdownRows(r) + '</table>' +
    '<h4>Farm plan</h4>' +
    '<div class="costchips">' +
    '<div class="chip">Position <b>' + fmtUsd(r.position_lo_usd) + '–' + fmtUsd(r.position_hi_usd) + '</b></div>' +
    '<div class="chip">Fees <b>~' + fmtUsd(r.weekly_cost_usd) + '/wk</b></div>' +
    '<div class="chip">Run for <b>' + r.weeks + ' weeks</b></div></div>' +
    '<ol class="plan">' + r.farm_steps.map((s) =>
      '<li><input type="checkbox"><span>' + s + '</span></li>').join('') + '</ol>';
  $('detail').hidden = false;
  renderBoard();
}

function closeDetail() {
  state.slug = '';
  $('detail').hidden = true;
  renderBoard();
}

// ------------------------------------------------------------------ events
function syncUrl() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.cat) p.set('cat', state.cat);
  if (state.chain) p.set('chain', state.chain);
  if (state.status !== 'pre') p.set('status', state.status);
  if (state.watch) p.set('watch', '1');
  if (state.sort !== 'implied') p.set('sort', state.sort);
  if (state.slug) p.set('slug', state.slug);
  history.replaceState(null, '', p.toString() ? '?' + p : location.pathname);
}

function update() { syncUrl(); renderBoard(); }

$('q').addEventListener('input', (e) => { state.q = e.target.value; update(); });
$('cat').addEventListener('change', (e) => { state.cat = e.target.value; update(); });
$('chain').addEventListener('change', (e) => { state.chain = e.target.value; update(); });
$('watch').addEventListener('change', (e) => { state.watch = e.target.checked; update(); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; update(); });
document.querySelectorAll('.segmented button').forEach((b) =>
  b.addEventListener('click', () => {
    state.status = b.dataset.status;
    document.querySelectorAll('.segmented button').forEach((x) =>
      x.classList.toggle('on', x === b));
    update();
  }));
document.querySelectorAll('th.sortable').forEach((th) =>
  th.addEventListener('click', () => { state.sort = th.dataset.sort; $('sort').value = state.sort; update(); }));
$('boardBody').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-slug]');
  if (tr) { openDetail(tr.dataset.slug); syncUrl(); }
});
$('detailClose').addEventListener('click', () => { closeDetail(); syncUrl(); });

renderChips();
renderMultiples();
renderControls();
renderBoard();
if (state.slug) openDetail(state.slug);
