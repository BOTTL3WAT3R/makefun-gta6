// main.ts — hands the Golden Hour entry in: it copies game/ and
// screenshots/ from this repository into the output directory and writes
// dossier.json with the kit's own buildDossier, so the dossier is byte for
// byte the one the scorer rebuilds from the same files. Node 22, standard
// library only, no network. Outside the grader, MAKEFUN_OUTPUT_DIR stands
// in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from an empty output directory so stale files can never leak into
// an entry, then copy the two payload trees across.
rmSync(out, { recursive: true, force: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (the kit's reference gate): only text_max_bytes
// shapes the dossier's bytes; the rest refuse anything the scorer would
// refuse — too many screenshots, an oversized one, a game tree too big.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log('Golden Hour entry written to ' + out);
