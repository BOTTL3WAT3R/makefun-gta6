# Golden Hour — Costa Vera

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/BOTTL3WAT3R/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/BOTTL3WAT3R/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game that plays in a desktop browser from
static files — no build step, no network requests. One sun-soaked coastal
city, one fixer, seven story jobs, and a tide that goes out tonight.

**Costa Vera** is a grid of pastel avenues around the Plaza del Faro, with a
boardwalk, a pier reaching into the sea, and named places with their own
lives: Club Brisa, the Clínica del Sol, the Mercado Brisa, Taller Vera and
the Comisaría. Fixer **Pilar Duarte** holds court by the fountain and hands
out the work: deliveries, a pier pickup, a debt to collect from a man who
runs, an escort, a shootout, a race against the clock, and a finale —
*La Última Marea* — where the whole police force tries to stop one last
boat, under a four-star heat that will not cool until the tide goes out.

## Play it

Serve the `game/` folder with any static file server and open
`index.html` in desktop Chrome, for example:

```
node serve.ts            # if you have the kit's helper, or
npx serve game           # any static server works
```

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse (click to lock) | Camera |
| E | Talk, use a service, start a race, advance dialogue |
| F | Enter / exit a car (steal it, if it's moving traffic) |
| Mouse click | Fire the pistol |
| Shift | Sprint |
| Space | Handbrake |
| Q | Change radio station (in a car) |
| T | Taxi duty on / off (in a Taxímetro cab) |
| Esc | Pause — save, restart, or quit to title |

## What's in the city

- **A seven-job story** with dialogue, job cards, timers, a foot chase, an
  escort and a shootout, ending in a full ending screen — then free roam.
- **Six stealable vehicle types** (Veloz GT, Palmera Cabrio, Andante Sedan,
  Taxímetro, Carguera Van, Ranchera Pickup), each with its own handling,
  plus living traffic that cruises the grid, brakes and turns.
- **A wanted system from one to five stars**: pursuing cruisers with
  flashing lightbars, a searchlight helicopter from four stars, a three-car
  roadblock at five, and BUSTED / WASTED consequences with fines, fees and
  respawns at the Comisaría and the Clínica.
- **Combat**: a hitscan pistol with tracers and muzzle flash, and hostile
  gunmen who keep their range, strafe and fire in bursts.
- **Activities**: the Gran Vuelta (10 gates) and Boardwalk Run (8 gates)
  races, taxi duty with pickups and paid fares, and 15 hidden packages.
- **Three services**: the Clínica heals you for $60, the Mercado sells a
  +30 health energy drink for $10, and Taller Vera repairs your car for $40.
- **A full HUD**: minimap with objective, police, package and fare blips,
  wanted stars, cash, health, speedometer and a four-station synthesised
  radio — every sound in the game is generated with WebAudio, no audio files.
- **Saving**: localStorage saves cash, story progress, packages and your
  position; Continue picks up exactly where you left off.

## Layout

- `main.ts` — the entry program (Node 22, standard library only): copies
  `game/` and `screenshots/` to the output directory and writes
  `dossier.json` with the kit's `buildDossier`.
- `game/` — the game itself, one module per system: `world.js` (the city),
  `vehicles.js`, `people.js`, `police.js`, `combat.js`, `missions.js`
  (story, races, taxi, packages), `hud.js`, `audio.js`, `util.js`, and
  `main.js` wiring them together. three.js is vendored as
  `game/three.module.min.js`.
- `screenshots/` — four real renders of the game running in a browser.

Everything — city, characters, vehicles, names, story, art and music — is
original to this entry.

---

Built for the [make.fun](https://make.fun/bounty/gta6-01) "Make GTA 6"
bounty. New here? Join through my referral link:
https://make.fun/r/beyt0vmy
