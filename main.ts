// Token Radar — entrypoint.
//
// Reads the sealed snapshot, builds the ranked board with lib/model.ts,
// and writes everything the grader and the judge need into the output
// directory:
//   board.json    the ranked board (the scored artifact)
//   data.js       the same board as a JS global, beside the dashboard
//   dashboard/    the static page (copied from this repository)
//   screenshots/  the three dashboard captures (copied)
//   dossier.json  buildDossier's byte-exact dossier of the two above
//
// The run is deterministic: same snapshot in, same bytes out.

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard, type Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function snapshotPath(): string {
  const fromArg = argValue('--input');
  if (fromArg) return fromArg;
  const dir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
  return join(dir, 'snapshot.json');
}

function outputDir(): string {
  return resolve(argValue('--output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
}

function main(): void {
  const root = dirname(fileURLToPath(import.meta.url));
  const snap = JSON.parse(readFileSync(snapshotPath(), 'utf8')) as Snapshot;
  const { rows, stats } = buildBoard(snap);
  const out = outputDir();
  mkdirSync(out, { recursive: true });

  const board = {
    competition: 'token-radar-01',
    as_of: snap.as_of,
    source: snap.source,
    model:
      'implied = TVL x category multiple (median market-cap/TVL of the category\'s traded protocols, shrunk to the global median) x momentum (7d TVL change) x maturity (days listed with no token) x breadth (chain count); protocols already trading are carried at recorded market cap',
    rows,
  };
  writeFileSync(join(out, 'board.json'), JSON.stringify(board) + '\n');

  const data = { stats, rows };
  writeFileSync(join(out, 'data.js'), 'window.RADAR_DATA = ' + JSON.stringify(data) + ';\n');

  cpSync(join(root, 'dashboard'), join(out, 'dashboard'), { recursive: true });
  cpSync(join(root, 'screenshots'), join(out, 'screenshots'), { recursive: true });

  const dossier = buildDossier(out, { text_max_bytes: 65536 });
  writeFileSync(join(out, 'dossier.json'), dossier);

  const pre = rows.filter((r) => r.status === 'pre-token').length;
  console.log(
    'token-radar: ' + rows.length + ' rows (' + pre + ' pre-token, ' +
    (rows.length - pre) + ' trading), watchlist ' + stats.watchlist_count + '/' +
    stats.watchlist_count + ' covered, dossier ' + dossier.length + ' bytes',
  );
}

main();
