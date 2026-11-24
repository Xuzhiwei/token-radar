// Token Radar value model.
//
// Everything on the board is derived from the snapshot's own figures at run
// time. No protocol is named in this file: the model reads the sealed
// DefiLlama snapshot, learns what a dollar of TVL is worth in each category
// from the protocols whose token already trades, and applies that yardstick
// to the protocols that record no token yet.
//
// Implied value of a pre-token protocol:
//
//   implied = TVL x category multiple x momentum x maturity x breadth
//
//   category multiple  the median market-cap/TVL ratio of the tokenised
//                      protocols in the same category, shrunk toward the
//                      global median when the category has few traded
//                      tokens, and clamped to [0.05, 8].
//   momentum           1 + 0.008 x clamp(change_7d, -40, +60): a protocol
//                      gaining TVL is gathering the users a launch rewards.
//   maturity           1 + 0.30 x (1 - exp(-years/2.2)), years counted from
//                      listed_at to the snapshot's as_of day: the longer a
//                      protocol has run with no token, the more credible a
//                      large launch is. Unknown listing day scores 1.
//   breadth            1 + 0.025 x min(chains - 1, 8): more chains, more
//                      wallets a launch can reach.
//
// Whether a token already trades is the snapshot's own test, the one its
// watchlist definition uses: a protocol records a token when the snapshot
// gives it a CoinGecko id or a symbol. A recorded market cap alone does
// not decide it, and neither does a missing one: hundreds of entries name
// a token (a sub-deployment of Aave, of Uniswap, of Morpho) while the
// snapshot reports no cap for that entry. Those protocols' tokens exist,
// so they are carried as "trading", never priced as launches still to
// come. A trading protocol with a recorded cap is carried at that cap;
// one without is carried at TVL x its category multiple — the same
// yardstick, with no launch adjustments — and flagged as unreported, so
// the board separates what is still to come from what already trades.
//
// Before any pricing, a launch-eligibility screen decides which of the
// protocols that record no token are launch candidates at all. It mirrors
// the full rule the snapshot itself uses to build its watchlist (input
// README, "The watchlist"): a protocol is NOT a launch candidate when it
// is a wrapped, staked or bridged product of another protocol, which the
// snapshot's rule recognises by
//
//   - its category: CEX (a custodial exchange's own balances), Bridge or
//     Canonical Bridge (assets custodied in transit, not a protocol's own
//     product), or Liquid Staking, Liquid Restaking or Restaked BTC (a
//     claim on an asset already staked — the snapshot's own example is
//     WBTC, Bitcoin on Ethereum: a wrapped product, not a launch);
//   - its name beginning with an exchange's name (Binance, Coinbase,
//     Bybit, Kraken, Bitget, OKX, Bitfinex or Gemini): the entry is that
//     exchange's own product, not an independent protocol;
//   - its name carrying a whole word wrapped, staked or staking, or
//     ending in a version marker (a space followed by V2, v2, 2.0 or the
//     like): a wrapped, staked or later-version deployment of a protocol
//     whose token already trades, so the launch it could have has already
//     happened under the parent name.
//
// Screened-out protocols are excluded from the board entirely and counted
// in the stats the dashboard shows. The screen only decides candidacy for
// protocols that record no token; a protocol that records one is carried
// as trading either way.
//
// A recorded market cap of zero or less is not a price: the snapshot uses
// it as a placeholder for a token whose cap was not reported, and carrying
// it onto the board would state an implied value of $0 or less. Such a
// protocol is treated as recording no cap — if it records a token it is
// carried as trading at the yardstick value, otherwise it is priced by
// the model like any other pre-token protocol (and screened like one) —
// and its placeholder cap never enters the multiples yardstick.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface MultipleStat {
  category: string;
  traded_count: number;
  median: number;
  applied: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  status: 'pre-token' | 'trading';
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  symbol: string | null;
  watchlist: boolean;
  multiple: number;
  base_value_usd: number;
  momentum_factor: number;
  maturity_factor: number;
  breadth_factor: number;
  days_listed: number | null;
  position_lo_usd: number;
  position_hi_usd: number;
  weekly_cost_usd: number;
  weeks: number;
}

export interface ModelStats {
  as_of: string;
  floor_usd: number;
  protocol_count: number;
  pre_token_count: number;
  trading_count: number;
  trading_unreported_count: number;
  screened_out_count: number;
  watchlist_count: number;
  watchlist_covered: number;
  global_median_multiple: number;
  multiples: MultipleStat[];
  total_implied_usd: number;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

function median(xs: number[]): number {
  const a = [...xs].sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Deterministic per-slug hash so template choices are stable across runs. */
function slugHash(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z');
  return Math.max(0, Math.round(ms / 86400000));
}

export function fmtUsd(n: number): string {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  if (n >= 100) return '$' + Math.round(n).toString();
  return '$' + (Math.round(n * 100) / 100).toFixed(2);
}

// ---------------------------------------------------------------- multiples

/** A usable recorded market cap: present, and more than the $0 placeholder. */
export function hasRecordedCap(p: Protocol): boolean {
  return p.mcap_usd != null && p.mcap_usd > 0;
}

/**
 * The snapshot's own test for a token that exists: it gives the protocol a
 * CoinGecko id or a symbol. Its watchlist counts a protocol as recording
 * no token only when both are null.
 */
export function recordsToken(p: Protocol): boolean {
  return p.gecko_id != null || p.symbol != null;
}

export function computeMultiples(protocols: Protocol[]): { globalMedian: number; stats: MultipleStat[] } {
  const traded = protocols.filter((p) => hasRecordedCap(p) && p.tvl_usd > 0);
  const globalMedian = median(traded.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  const byCat = new Map<string, number[]>();
  for (const p of traded) {
    const cat = p.category ?? 'Uncategorised';
    const arr = byCat.get(cat) ?? [];
    arr.push((p.mcap_usd as number) / p.tvl_usd);
    byCat.set(cat, arr);
  }
  const stats: MultipleStat[] = [];
  for (const [category, ratios] of byCat) {
    const med = median(ratios);
    // Shrink thin categories toward the global median: weight 4 pseudo-counts.
    const shrunk = (ratios.length * med + 4 * globalMedian) / (ratios.length + 4);
    stats.push({ category, traded_count: ratios.length, median: med, applied: clamp(shrunk, 0.05, 8) });
  }
  stats.sort((a, b) => (a.category < b.category ? -1 : 1));
  return { globalMedian, stats };
}

function multipleFor(category: string | null, stats: Map<string, MultipleStat>, globalMedian: number): number {
  const s = stats.get(category ?? 'Uncategorised');
  return s ? s.applied : clamp(globalMedian, 0.05, 8);
}

// ------------------------------------------------------- eligibility screen

const EXCHANGE_NAME_PREFIXES = [
  'Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini',
];
// Categories the snapshot's watchlist rule treats as marking a wrapped,
// staked or bridged product of another protocol rather than an
// independent protocol awaiting its own launch.
const PRODUCT_CATEGORIES = [
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC',
];
const DERIVATIVE_WORD = /\b(?:wrapped|staked|staking)\b/i;
// A space, then V<digits> (2, 3, 2.1, 12...) or a dotted version (2.0, 3.1...).
const VERSION_MARKER = /\s(?:[vV]\d+(?:\.\d+)?|\d+\.\d+(?:\.\d+)?)$/;

/**
 * Why a protocol that records no token is not a launch candidate, or null
 * when it is one. The rules are the snapshot watchlist's own (see the
 * header): a CEX or wrapped/staked/bridged-product category, an
 * exchange's name at the front of the name, or a name that marks the
 * entry as a wrapped, staked or later-version product of a protocol
 * whose token already trades.
 */
export function launchScreenReason(p: Protocol): string | null {
  if (p.category === 'CEX') return 'CEX category: a custodial exchange tracker';
  if (p.category !== null && PRODUCT_CATEGORIES.includes(p.category)) {
    return 'a wrapped, staked or bridged product (' + p.category + ' category)';
  }
  for (const ex of EXCHANGE_NAME_PREFIXES) {
    if (p.name === ex || p.name.startsWith(ex + ' ')) {
      return 'begins with an exchange name (' + ex + ')';
    }
  }
  if (DERIVATIVE_WORD.test(p.name)) return 'a wrapped or staked product of a traded token';
  if (VERSION_MARKER.test(p.name)) return 'a later version of a protocol that already trades';
  return null;
}

// ------------------------------------------------------------------- chains

/** Typical all-in cost of one simple transaction, in USD, by chain. */
const CHAIN_TX_COST: Record<string, number> = {
  Ethereum: 6.5, Solana: 0.02, Base: 0.05, Arbitrum: 0.12, Optimism: 0.08,
  BSC: 0.15, Polygon: 0.02, Avalanche: 0.25, 'zkSync Era': 0.1, Linea: 0.08,
  Scroll: 0.1, Mantle: 0.05, Blast: 0.03, Berachain: 0.05, Sonic: 0.01,
  Sui: 0.01, Aptos: 0.01, Tron: 1.0, Bitcoin: 1.5, Starknet: 0.05,
  Gnosis: 0.01, Fantom: 0.02, Cronos: 0.05, Celo: 0.01, Moonbeam: 0.05,
  Near: 0.01, Cosmos: 0.02, Osmosis: 0.02, Sei: 0.01, Injective: 0.01,
  Kaia: 0.01, Taiko: 0.06, Mode: 0.03, Zora: 0.03, Fraxtal: 0.03,
  'OP Mainnet': 0.08, 'X Layer': 0.02, BOB: 0.03, Unichain: 0.03, Ink: 0.03,
  'World Chain': 0.02, Hyperliquid: 0.02, Eclipse: 0.02, Soon: 0.02,
};

function txCost(chain: string): number {
  return CHAIN_TX_COST[chain] ?? 0.5;
}

function positionTier(tvl: number): { lo: number; hi: number } {
  if (tvl >= 1e9) return { lo: 10000, hi: 50000 };
  if (tvl >= 2.5e8) return { lo: 5000, hi: 20000 };
  if (tvl >= 5e7) return { lo: 2000, hi: 10000 };
  if (tvl >= 1e7) return { lo: 500, hi: 3000 };
  return { lo: 150, hi: 1000 };
}

// --------------------------------------------------------------- farm plans

type PlaybookKey =
  | 'dex' | 'lending' | 'yield' | 'bridge' | 'derivatives' | 'staking'
  | 'restaking' | 'stable' | 'cex' | 'launchpad' | 'rwa' | 'chain'
  | 'prediction' | 'nft' | 'generic';

function playbookFor(category: string): PlaybookKey {
  switch (category) {
    case 'Dexs': return 'dex';
    case 'Lending': case 'Uncollateralized Lending': return 'lending';
    case 'Yield': case 'Yield Aggregator': case 'Farm': case 'Leveraged Farming':
    case 'Liquidity Manager': case 'Risk Curators': case 'Onchain Capital Allocator':
    case 'Basis Trading': case 'Indexes': return 'yield';
    case 'Bridge': case 'Canonical Bridge': case 'Cross Chain Bridge': return 'bridge';
    case 'Derivatives': case 'Options': case 'Options Vault':
    case 'Interest Rate Derivatives': case 'Synthetics': return 'derivatives';
    case 'Liquid Staking': case 'Staking Pool': return 'staking';
    case 'Restaking': case 'Liquid Restaking': case 'Restaked BTC': return 'restaking';
    case 'CDP': case 'CDP Manager': case 'Algo-Stables': case 'Dual-Token Stablecoin':
    case 'Stablecoin Issuer': case 'Stablecoin Wrapper': case 'Anchor BTC':
    case 'Decentralized BTC': return 'stable';
    case 'CEX': case 'CeDeFi': case 'Crypto Card Issuer': case 'OTC Marketplace': return 'cex';
    case 'Launchpad': return 'launchpad';
    case 'RWA': return 'rwa';
    case 'Chain': return 'chain';
    case 'Prediction Market': return 'prediction';
    case 'NFT Marketplace': return 'nft';
    default: return 'generic';
  }
}

interface FarmCtx {
  name: string;
  chain: string;
  chain2: string | null;
  chainsLabel: string;
  posLo: string;
  posHi: string;
  gas: string;
  gasWeek: string;
  weeks: number;
  tvl: string;
  trading: boolean;
  pick: number;
}

const CORE_ACTIONS: Record<PlaybookKey, [string, string]> = {
  dex: [
    'Swap through {name} on {chain} twice a week, rotating pairs and sizes between {posLo} and {posHi} a trade, so your volume profile looks like a regular trader rather than a single burst.',
    'Provide liquidity to a top-three pool on {name} with {posLo} to {posHi}, keeping the position in range and claiming fees weekly; LP activity is the behaviour DEX launches reward most consistently.',
  ],
  lending: [
    'Supply {posLo} to {posHi} of a blue-chip asset to {name} on {chain} and leave it supplied; consistent supplied balances over weeks are the core signal lending launches measure.',
    'Borrow a modest amount against your supply on {name} (stay under 40% of the borrow limit) and repay on a weekly cycle, which adds genuine borrower activity on top of the supply side.',
  ],
  yield: [
    'Deposit {posLo} to {posHi} into a flagship vault on {name} via {chain} and hold the position; vault share balance over time is the metric yield protocols snapshot first.',
    'Rotate a second tranche of {posLo} to {posHi} through another {name} vault or market every two weeks, so your history shows breadth across the product, not one parked deposit.',
  ],
  bridge: [
    'Bridge {posLo} to {posHi} from Ethereum to {chain} through {name}, then bridge a smaller amount back a few days later; completed round trips in both directions count far more than one-way transfers.',
    'Repeat the crossing on a second route {name} supports (for example toward {chain2}), keeping each transfer between {posLo} and {posHi} and spacing crossings at least a week apart.',
  ],
  derivatives: [
    'Open small perpetual positions on {name} via {chain}, {posLo} to {posHi} of margin at low leverage, and trade two or three times a week so your volume and open-interest history build steadily.',
    'Use a second {name} surface (options, a vault, or another market) with {posLo} to {posHi} once a week; multi-product traders are the cohort derivatives launches usually weight highest.',
  ],
  staking: [
    'Stake {posLo} to {posHi} of the base asset through {name} on {chain} and hold the liquid staking token in the same wallet; duration-weighted stake is the signal staking launches snapshot.',
    'Put a slice of the staking token to work in a paired pool or lending market ({posLo} to {posHi}) so the position also shows DeFi activity beyond a passive hold.',
  ],
  restaking: [
    'Restake {posLo} to {posHi} through {name} on {chain} and keep the position untouched; restaking points accrue by balance and time, so an early, steady position beats a late large one.',
    'Diversify into a second operator or strategy on {name} with {posLo} to {posHi} after two weeks, and claim or compound any rewards on a monthly cycle.',
  ],
  stable: [
    'Mint or borrow {posLo} to {posHi} of the stablecoin against collateral on {name} via {chain}, and keep the position open; outstanding borrows are what CDP launches measure.',
    'Hold or supply the issued stablecoin in a paired pool with {posLo} to {posHi} for at least {weeks} weeks, adding a little on dips rather than moving the whole position at once.',
  ],
  cex: [
    'Complete verification on {name}, deposit {posLo} to {posHi}, and run your normal spot trading through it two or three times a week; exchange launches reward account age plus real volume.',
    'Hold a working balance on {name} and use a second product (earn, convert, or futures) with {posLo} to {posHi} monthly, so the account shows breadth, not just deposits.',
  ],
  launchpad: [
    'Register and complete the participation steps on {name} early, then take a {posLo} to {posHi} allocation in at least two sales; completed participations are the history launchpads snapshot.',
    'Stake or hold the platform balance {name} asks for with {posLo} to {posHi} and keep it through each sale window, since tier snapshots are usually taken without warning.',
  ],
  rwa: [
    'Onboard and complete compliance on {name}, then allocate {posLo} to {posHi} into a flagship real-world-asset vault on {chain}; verified holders are the cohort RWA launches can legally reward.',
    'Add a second position of {posLo} to {posHi} in a different {name} asset class after a month, and keep both through a full distribution cycle to build holder history.',
  ],
  chain: [
    'Hold a working balance on {chain} and use {name} weekly: transfers, one swap and one contract interaction per session, {posLo} to {posHi} of value moved, so the wallet reads as a resident, not a tourist.',
    'Deploy or interact with two native apps on {name} each week with small amounts ({posLo} to {posHi}); new chains reward wallets with long, varied on-chain histories.',
  ],
  prediction: [
    'Trade small positions on {name} across at least three markets a week, {posLo} to {posHi} in total exposure, and let some positions settle rather than closing everything early.',
    'Provide liquidity or take the other side of thin markets on {name} with {posLo} to {posHi}; makers and early settlers are the users prediction launches tend to reward.',
  ],
  nft: [
    'List and trade modestly on {name}: a few buys and sales a month between {posLo} and {posHi} in total, spread across collections rather than wash-trading one item.',
    'Use a second {name} feature (offers, bulk listing, or a launch) once a month with {posLo} to {posHi} of activity so the account history covers more than plain swaps.',
  ],
  generic: [
    'Use the core product on {name} via {chain} with {posLo} to {posHi} at stake, twice a week; consistent, real usage over weeks is what almost every launch snapshot measures.',
    'Try a second surface of {name} (another chain such as {chain2}, market, or feature) with {posLo} to {posHi} once a week, so your history shows breadth across the product.',
  ],
};

function fill(tpl: string, ctx: FarmCtx): string {
  return tpl
    .replaceAll('{name}', ctx.name)
    .replaceAll('{chain}', ctx.chain)
    .replaceAll('{chain2}', ctx.chain2 ?? ctx.chain)
    .replaceAll('{chains}', ctx.chainsLabel)
    .replaceAll('{posLo}', ctx.posLo)
    .replaceAll('{posHi}', ctx.posHi)
    .replaceAll('{gas}', ctx.gas)
    .replaceAll('{gasWeek}', ctx.gasWeek)
    .replaceAll('{weeks}', String(ctx.weeks))
    .replaceAll('{tvl}', ctx.tvl);
}

export function farmSteps(p: Protocol, trading: boolean, pick: number): { steps: string[]; weeklyCost: number; weeks: number; posLo: number; posHi: number } {
  const chain = p.chains[0] ?? 'Ethereum';
  const chain2 = p.chains[1] ?? null;
  const tier = positionTier(p.tvl_usd);
  const perTx = txCost(chain);
  const weeklyTx = 5;
  const weeklyCost = Math.max(0.01, Math.round(perTx * weeklyTx * 100) / 100);
  const weeks = p.tvl_usd >= 5e7 ? 12 : p.tvl_usd >= 1e7 ? 10 : 8;
  const ctx: FarmCtx = {
    name: p.name,
    chain,
    chain2,
    chainsLabel: p.chains.slice(0, 3).join(', ') || chain,
    posLo: fmtUsd(tier.lo),
    posHi: fmtUsd(tier.hi),
    gas: fmtUsd(perTx),
    gasWeek: fmtUsd(weeklyCost),
    weeks,
    tvl: fmtUsd(p.tvl_usd),
    trading,
    pick,
  };
  const key = playbookFor(p.category ?? '');
  const [core1, core2] = CORE_ACTIONS[key];
  const setupVariants = [
    'Set up a fresh wallet, fund it on {chain}, and budget about {gas} per transaction there (roughly {gasWeek} a week at five transactions). Keep this wallet dedicated to {name} so its history stays clean.',
    'Prepare a wallet you control and move working funds to {chain}; transactions there run about {gas} each, so a realistic farming budget is {gasWeek} a week plus the capital below.',
    'Start with a wallet funded on {chain} ({chains}). At roughly {gas} a transaction, expect near {gasWeek} a week in network fees at a steady cadence.',
  ];
  const cadenceVariants = [
    'Keep the routine running for at least {weeks} weeks without a gap: two or three sessions a week, varying amounts and times of day, reads as an organic user and costs about {gasWeek} a week in fees.',
    'Repeat on a two-to-three-sessions-a-week rhythm for {weeks} weeks, changing order sizes and days; steady longevity is worth more than one big week, and the fee budget stays near {gasWeek} a week.',
    'Sustain the activity for {weeks} weeks, checking in two or three times a week and never going quiet for a full week; the whole plan costs roughly {gasWeek} a week in network fees on {chain}.',
  ];
  const closePreToken = [
    'Track {name} monthly: keep records of your positions and fees, watch for a points programme, snapshot or token announcement, and be ready to claim from this same wallet if a launch lands.',
    'Review the position monthly against {name}\'s {tvl} TVL trend, keep your own log of activity and costs, and hold the routine until a points or token announcement gives you a reason to stop.',
  ];
  const closeTrading = [
    '{name} already trades, so farm the next season instead: stay active through the current rewards cycle, keep records of fees and positions, and watch for a season-two or ecosystem airdrop announcement.',
    'Because {name}\'s token already trades, treat this as season farming: keep the activity running, stake or hold any rewards in the same wallet, and track governance votes, which later seasons often count.',
  ];
  const steps = [
    fill(setupVariants[pick % setupVariants.length], ctx),
    fill(core1, ctx),
    fill(core2, ctx),
    fill(cadenceVariants[pick % cadenceVariants.length], ctx),
    fill(trading ? closeTrading[pick % closeTrading.length] : closePreToken[pick % closePreToken.length], ctx),
  ];
  return { steps, weeklyCost, weeks, posLo: tier.lo, posHi: tier.hi };
}

// -------------------------------------------------------------------- board

export function buildBoard(snapshot: Snapshot): { rows: BoardRow[]; stats: ModelStats } {
  const { globalMedian, stats: multStats } = computeMultiples(snapshot.protocols);
  const statMap = new Map(multStats.map((s) => [s.category, s]));
  const watch = new Set(snapshot.watchlist);

  // Eligibility screen: protocols that record no token and are not launch
  // candidates never reach the board. Protocols that record a token are
  // always carried, as trading.
  const candidates = snapshot.protocols.filter(
    (p) => hasRecordedCap(p) || recordsToken(p) || launchScreenReason(p) === null,
  );
  const screenedOut = snapshot.protocols.length - candidates.length;

  const scored = candidates.map((p) => {
    const capRecorded = hasRecordedCap(p);
    const trading = capRecorded || recordsToken(p);
    const multiple = capRecorded
      ? (p.mcap_usd as number) / Math.max(1, p.tvl_usd)
      : multipleFor(p.category, statMap, globalMedian);
    const base = capRecorded ? (p.mcap_usd as number) : p.tvl_usd * multiple;
    const momentum = trading || p.change_7d == null ? 1 : 1 + 0.008 * clamp(p.change_7d, -40, 60);
    const days = p.listed_at ? daysBetween(p.listed_at, snapshot.as_of) : null;
    const maturity = trading || days == null ? 1 : 1 + 0.3 * (1 - Math.exp(-(days / 365.25) / 2.2));
    const breadth = trading ? 1 : 1 + 0.025 * Math.min(Math.max(p.chains.length - 1, 0), 8);
    const implied = capRecorded
      ? (p.mcap_usd as number)
      : Math.max(1, Math.round(base * momentum * maturity * breadth));
    const farm = farmSteps(p, trading, slugHash(p.slug) % 997);
    const row: BoardRow = {
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: implied,
      farm_steps: farm.steps,
      status: trading ? 'trading' : 'pre-token',
      category: p.category ?? 'Uncategorised',
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      symbol: p.symbol,
      watchlist: watch.has(p.slug),
      multiple: Math.round(multiple * 1000) / 1000,
      base_value_usd: Math.round(base),
      momentum_factor: Math.round(momentum * 1000) / 1000,
      maturity_factor: Math.round(maturity * 1000) / 1000,
      breadth_factor: Math.round(breadth * 1000) / 1000,
      days_listed: days,
      position_lo_usd: farm.posLo,
      position_hi_usd: farm.posHi,
      weekly_cost_usd: farm.weeklyCost,
      weeks: farm.weeks,
    };
    return row;
  });

  scored.sort((a, b) =>
    b.implied_value_usd - a.implied_value_usd ||
    b.tvl_usd - a.tvl_usd ||
    (a.slug < b.slug ? -1 : 1),
  );
  scored.forEach((r, i) => { r.rank = i + 1; });

  const stats: ModelStats = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    protocol_count: snapshot.protocols.length,
    pre_token_count: scored.filter((r) => r.status === 'pre-token').length,
    trading_count: scored.filter((r) => r.status === 'trading').length,
    trading_unreported_count: candidates.filter((p) => recordsToken(p) && !hasRecordedCap(p)).length,
    screened_out_count: screenedOut,
    watchlist_count: snapshot.watchlist.length,
    watchlist_covered: scored.filter((r) => r.watchlist).length,
    global_median_multiple: Math.round(globalMedian * 1000) / 1000,
    multiples: multStats,
    total_implied_usd: scored.filter((r) => r.status === 'pre-token').reduce((s, r) => s + r.implied_value_usd, 0),
  };
  return { rows: scored, stats };
}
