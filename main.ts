// Costa Vera handoff: the program that packages this repository into a
// make.fun gta6-01 entry. It performs three steps and nothing else —
//   1. wipe and recreate the output directory, so no stale bytes survive;
//   2. copy game/ and screenshots/ across exactly as they sit in the repo;
//   3. describe the copied tree with the vendored buildDossier library and
//      save that description as dossier.json.
// Only Node's standard library is used, nothing is fetched, and the output
// depends solely on the repository contents, which is what makes repeated
// runs byte-identical.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The limits the bounty scores against: 160 KiB of source text in the
// dossier, up to 4 screenshots of 256 KiB apiece, and a game tree capped at
// 993 entries and 48 MiB. buildDossier throws if the tree breaks any cap.
const ENTRY_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

// Anchor every path to this file's folder rather than the caller's working
// directory: the grader mounts the snapshot read-only at an arbitrary path.
const repoDir = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// A clean slate first — reproducibility means the output may contain only
// what this run puts there.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// The two payloads of the entry. game/ holds the playable static site;
// screenshots/ holds the four renders the judge sees first.
for (const part of ['game', 'screenshots']) {
  const source = join(repoDir, part);
  if (existsSync(source)) cpSync(source, join(outDir, part), { recursive: true });
}

// Build the dossier from the copies (never from the repo itself) so the
// description provably matches the bytes that were handed over.
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, ENTRY_CAPS));
