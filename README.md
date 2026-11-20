# Xuzhiwei/token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Xuzhiwei/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Xuzhiwei/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar answers one question: which protocols that record no token yet would be worth the most if they launched one, and what should you do about it now? The program reads the sealed DefiLlama snapshot and learns its yardstick from the snapshot itself — for each category it takes the median market-cap/TVL multiple of the protocols whose token already trades, shrunk toward the global median — then prices every launch candidate as implied = TVL × category multiple × momentum (7-day TVL change) × maturity (how long it has run with no token) × breadth (chain count). Before pricing, a launch-eligibility screen mirroring the snapshot's own watchlist rule removes the entries that are not launch candidates at all: CEX trackers, products whose name begins with an exchange's name, and wrapped, staked or later-version deployments of protocols whose token already trades. Protocols already trading are carried at their recorded market cap and flagged, never mixed into the pre-token claim. Every ranked protocol carries a concrete farm plan generated from its own figures — position sizes scaled to its TVL tier, per-chain transaction costs, a weekly fee budget and an 8–12 week cadence. The dashboard is a static, offline page over the same data: a sortable, filterable board with search, category and chain filters, a pre-token/trading toggle, and a per-protocol detail view that shows the full derivation of its implied value next to its farm plan.

## Run it

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

It reads the sealed snapshot (`snapshot.json`) from the input directory and writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to the output directory.

---

<sub>Entered on [make.fun](https://make.fun/?ref=t69q2b72&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
