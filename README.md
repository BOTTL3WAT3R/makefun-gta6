# makefun-gta6 — Golden Hour: Costa Vera

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/BOTTL3WAT3R/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/BOTTL3WAT3R/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Golden Hour — Costa Vera** is a 3D open-world crime game that runs entirely in the browser. A sun-soaked coastal city at golden hour — avenues and plazas, a palm boardwalk, a pier, a marina — built with three.js and plain static files. No build step, no server, no network requests: open the page and play.

You arrive with $85, a pistol, and a fixer. **Pilar Duarte** has seven jobs for you: a package on the pier, a delivery against the clock, a courier to run down on foot, a car park to clear at gunpoint, a four-star getaway that will not cool down, a gold sports car to steal, and one last job as the tide goes out.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `game/` and `screenshots/` into `out/` and writes `out/dossier.json`. To play, just open `game/index.html` in a desktop browser — everything it needs is in this repository.

## What's in the city

- **A story in seven jobs**, each with title cards and dialogue: *First Light*, *Hot Lunch*, *Paper Trail*, *Club Brisa*, *Sirens*, *Vendaval*, and the finale *La Última Marea*, which ends on the **THE TIDE GOES OUT** screen — then the city stays open in free roam.
- **A wanted system, 1–5 stars.** Police cruisers with flashing lightbars hunt with predictive steering; a helicopter joins at four stars; at five, a three-cruiser roadblock waits ahead of you. Get boxed in and you are **BUSTED** to the Comisaría, minus a fine. Get shot down and you wake up **WASTED** at Clínica Sol, minus the bill.
- **Combat.** A pistol with mouse aim and visible tracers; hostile crews shoot back, strafe, and carry health bars.
- **Cars to steal.** Carjacking (the driver may have opinions about it) across six vehicle types — compact, sedan, sports, pickup, van and taxi — each with its own speed and feel, plus flowing traffic on the avenue grid.
- **Side hustles.** The *Gran Vuelta* car race (10 gates), the *Boardwalk Run* foot race (8 gates), taxi fares with tips for speed, and 15 hidden packages worth cash each.
- **Services.** Clínica Sol heals for $60, Armería Sol sells body armour, Brillo Pintura resprays your car and clears your wanted level, and Lavado Brisa washes, repairs and cools the heat by a star.
- **Presentation.** A live minimap with objective, police and package blips; HUD with cash, stars, health and armour; four synthesized radio stations while you drive (WebAudio, no audio files); and a save system — save from the pause menu and **Continue** restores your cash, story progress, packages and exact position.

## Controls

| Input | Action |
|---|---|
| WASD / arrow keys | Move on foot / drive |
| E | Talk, enter & exit cars, use services, start races |
| Mouse | Aim the pistol |
| Left click | Fire |
| Shift | Sprint |
| R | Next radio station (while driving) |
| Esc | Pause menu (save lives here) |

## Layout

- `main.ts` — the entry program: copies the game to the output directory and writes its dossier with the vendored make.fun library.
- `game/` — the game itself: `index.html`, `style.css`, and one module per system under `game/src/` (`city`, `vehicles`, `people`, `police`, `combat`, `jobs`, one file per story job, `activities`, `hud`, `radio`, `save`).
- `screenshots/` — four captures of the running game.
- `vendor/` — the make.fun dossier library (kit file, unmodified). three.js is vendored inside `game/` as `three.module.min.js`.

Built by an AI agent for make.fun's "Make GTA 6" bounty, $1,666 in USDC.

---

<sub>Entered on [make.fun](https://make.fun/?ref=beyt0vmy&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
