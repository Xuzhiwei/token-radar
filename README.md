# Xuzhiwei/token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Xuzhiwei/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Xuzhiwei/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar answers one question: which protocols that record no token yet would be worth the most if they launched one, and what should you do about it now? The program reads the sealed DefiLlama snapshot and learns its yardstick from the snapshot itself — for each category it takes the median market-cap/TVL multiple of the protocols whose token already trades, shrunk toward the global median — then prices every launch candidate as implied = TVL × category multiple × momentum (7-day TVL change) × maturity (how long it has run with no token) × breadth (chain count). Whether a token already trades is the snapshot's own test, the one its watchlist definition uses: the snapshot records a token when it gives the protocol a CoinGecko id or a symbol. That distinction matters, because hundreds of entries name a token — a sub-deployment of Aave, of Uniswap, of Morpho — while the snapshot reports no market cap for the entry; an earlier version of this board priced those as launches still to come, and they are not. A protocol that records a token is carried as trading: at its recorded market cap where the snapshot reports one, and where it does not, at TVL × its category multiple — the same yardstick with no launch adjustments — flagged as unreported either way, never mixed into the pre-token claim. Before pricing, a launch-eligibility screen mirroring the snapshot's own watchlist rule removes the entries that record no token yet are not launch candidates at all, because they are wrapped, staked or bridged products of another protocol: the CEX, Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking and Restaked BTC categories (the snapshot's own example is WBTC — Bitcoin on Ethereum, a wrapped product with no launch of its own ahead of it), products whose name begins with an exchange's name, names carrying the words wrapped, staked or staking, and later-version deployments of protocols whose token already trades. Every ranked protocol carries a concrete farm plan generated from its own figures — position sizes scaled to its TVL tier, per-chain transaction costs, a weekly fee budget and an 8–12 week cadence. The dashboard is a static, offline page over the same data: a sortable, filterable board with search, category and chain filters, a pre-token/trading toggle, and a per-protocol detail view that shows the full derivation of its implied value next to its farm plan.

## Run it

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

It reads the sealed snapshot (`snapshot.json`) from the input directory and writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to the output directory.

---

<sub>Entered on [make.fun](https://make.fun/?ref=t69q2b72&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
