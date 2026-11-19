// Golden Hour — Costa Vera · make.fun gta6-01 entry program.
//
// The game itself is the static site under game/ (open game/index.html in a
// desktop browser; it runs fully offline). This program is the hand-in: it
// copies game/ and screenshots/ into the output directory and writes a
// dossier.json describing them, built with the vendored make.fun library.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The output depends only on the bytes of game/ and screenshots/, so two
// runs over the same tree produce a byte-identical dossier. Nothing here
// reads the clock, the network or any randomness: same tree in, same
// dossier out, every time.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps for this competition: the dossier text budget, at most
// four screenshots of at most 256 KiB each, and the game tree limits.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyTree(join(repoDir, 'game'), join(outputDir, 'game'));
if (existsSync(join(repoDir, 'screenshots'))) {
  copyTree(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'));
} else {
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outputDir, DOSSIER_CAPS);
writeFileSync(join(outputDir, 'dossier.json'), dossier);
