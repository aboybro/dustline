# Dustline

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/aboybro/dustline/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/aboybro/dustline/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical FPS in a sun-baked desert solar farm, entered in
[make.fun's "Make the best three.js tactical FPS" bounty](https://make.fun/bounty/threejs-fps-02).

## The game

Solara Flats is a 56 × 40 m solar farm under a harsh desert sun: tilted panel
arrays, a control tower, inverter stations, a water tank and sandbag cover, cut
by three lanes — Panel Row West, Array Mid and Tower Road. Two bomb sites: **A**
in the west array, **B** under the tower.

- **Rounds:** first to 5 (max 9). Dust attacks on odd rounds, Heat on even
  rounds. Plant the charge (3.5 s) and defend it for 35 s, or defuse it (5 s).
- **Buy phase:** 15 s, $800 to start, $300 per kill, $3,000 for a round win,
  $1,900 for a loss, $300 for a plant.
- **Weapons:** AR-9 Sunburst rifle, Dust Devil SMG, Longshot DMR, Sandstorm 12
  shotgun and the P9 Sidewinder sidearm — each with its own damage, fire rate,
  spread and view model. Spread and bloom punish moving and sustained fire;
  crouching steadies your aim.
- **Grenades:** Cactus Frag, Dust Smoke (blocks bot sight) and Sunflare flash.
- **Bots:** your Dust squad (Mirage, Coyote, Sol) against Heat (Dune, Viper,
  Scorch, Ember). They walk lane routes, hold sites, engage only with real
  line of sight, hear gunfire, burst fire with range-based aim error, fall
  back when hurt, plant, defuse and retake.
- **Movement:** WASD, mouse look with pointer lock, sprint (Shift), crouch
  (Ctrl/C), jump (Space), reload (R), buy (B), grenade (Q), plant/defuse
  (hold E), mute (M).

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests: plain static files and vendored three.js
0.187.0, ES modules only.

## How it is built

- `game/src/` — one module per job: `world.js` (the solar farm, lanes, sites),
  `player.js` (movement and health), `weapon.js` (arsenal and grenades),
  `bots.js` (squad AI), `rounds.js` (round flow and economy), `effects.js`
  (tracers, sparks, smoke, the planted charge), `audio.js` (synthesised
  WebAudio), `hud.js` (HUD, buy menu and minimap), `input.js` (pointer lock
  and keys), `main.js` (fixed 60 Hz simulation, shooting, grenades, rounds).
- The simulation runs on a fixed 60 Hz step, separate from rendering.

<sub>Entered on [make.fun](https://make.fun/?ref=aboybro&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
