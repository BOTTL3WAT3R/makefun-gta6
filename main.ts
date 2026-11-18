// Golden Hour — Costa Vera: entrypoint for our gta6-01 submission (Node 22,
// standard library only). The game itself lives in game/ as plain static
// files — a 3D open-world crime game that a desktop browser plays fully
// offline — and this program is the courier that hands it in: it copies
// game/ and screenshots/ into /output and writes the dossier.json the judge
// reads, using the vendored make.fun library to build it.
//
// Play it locally with `node serve.ts` (http://localhost:8080).
// Away from the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail loudly rather than hand in a hollow entry: the game and at least
// three screenshots must be on disk before anything is copied across.
if (!existsSync(join(here, 'game', 'index.html')))
  throw new Error('game/index.html is missing — there is no game to hand in');
const shotCount = existsSync(join(here, 'screenshots'))
  ? readdirSync(join(here, 'screenshots')).filter(f => /\.(png|jpe?g)$/i.test(f)).length : 0;
if (shotCount < 3) throw new Error(`screenshots/ holds ${shotCount} image(s) — the dossier needs at least 3`);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The gate's caps, named once so the handoff reads plainly: the dossier's
// source text is trimmed to 160 KiB, screenshots are at most 4 files of
// 256 KiB each, and game/ stays within 993 entries, 48 MiB and 1000-byte
// paths — the same limits the scorer enforces on its side.
const dossierLimits = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
writeFileSync(join(out, 'dossier.json'), buildDossier(out, dossierLimits));

// A one-line receipt on the console (never in the output tree, so two runs
// stay byte-identical): how many game files were handed in, and their size.
const gameFiles = readdirSync(join(out, 'game'), { recursive: true })
  .filter(f => statSync(join(out, 'game', String(f))).isFile());
const gameBytes = gameFiles.reduce((n, f) => n + statSync(join(out, 'game', String(f))).size, 0);
console.log(`golden-hour: handed in ${gameFiles.length} game files (${gameBytes} bytes) and ${shotCount} screenshots`);
