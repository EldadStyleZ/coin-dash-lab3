# Hila AI status and handoff

Owner: Hila's Claude. Eldad created this initial template; from now on only Hila's
AI edits this file. Eldad owns FEATURES.md and mirrors this file into that board.
Read BOTH files after fetching before starting work; do not edit the other file.

## Reserved work

- Feature: ENEMY-TYPES — Chaser (slowly follows the player), Patroller (moves back
  and forth on a line), Zipper (fast, bounces off walls), plus a Space dash that
  destroys an enemy on contact for per-type points (Chaser 5, Patroller 3, Zipper 10).
  Contact without dashing still ends the round.
- Status: awaiting integration (pushed branch only; not ported to the current core).
- Branch / files: feat/enemy-types; game.js (own methods on CoinDash), settings.js
  (`enemyTypes`, `dash` sections).
- Latest commit: 667692d
- Checks passed: browser checks of all three behaviours, dash kills with per-type
  points and respawn, restart cleanup, no console errors.
- Failed / blocked checks: not yet tested against main's rewritten core.
- Requested integration hooks: enemies already carry `setData('type')` and
  `setData('speedMultiplier')` per docs/feature-contract.md. Exact hooks for the
  current core will be listed here before any shared file is edited.

## New claims / integration requests

All branches below are pushed and built on `hila/groundwork` (1466aa0), which was
cut from main at 1c2860c, before Eldad's core rewrite. None are merged into main.

| ID | Feature | Status | Branch / commit | Files | Notes |
| --- | --- | --- | --- | --- | --- |
| HILA-GROUNDWORK | Shared helpers for parallel features | awaiting integration | hila/groundwork 1466aa0 | game.js, settings.js, FEATURES.md | getDroneSpeed/Count, getRoundSeconds, addScore + `score` event, `updaters`/`hudItems` hooks, `difficulty` settings. Its FEATURES.md edit predates the single-writer rule: ignore it, this file is authoritative |
| DIFFICULTY | Easy / Normal / Hard start menu | awaiting integration | feat/difficulty 8a0f470 | game.js, settings.js | Keys 1/2/3 or click; Esc returns to the menu |
| POWERUPS-H | Shield, Speed and Magnet pickups | awaiting integration | feat/powerups 1b5f212 | game.js, settings.js | Spawn about every 15 s, each lasts 5 s |
| MULTIPLAYER | Optional local 2-player mode | awaiting integration | feat/local-multiplayer 6365737 | game.js, settings.js | M toggles 1P/2P; P1 WASD, P2 arrows, separate scores |
| COMBO-H | Combo multiplier for quick coins | awaiting integration | feat/combo 3928144 | game.js, settings.js | x2 to x5 within a 2 s window |
| NEAR-MISS | Close-call bonus near enemies | awaiting integration | feat/near-miss 8a2e648 | game.js, settings.js | +2 for passing close without touching |
| SHOOTING | Player shoots enemies | implementing | feat/shooting (on feat/enemy-types) | game.js, settings.js | F fires in the movement direction; uses the enemy-types kill path |
| HILA-INTEGRATION | Combined playtest of Hila's features | implementing | integration/all-features | game.js, settings.js | For testing only; will be pushed as a branch, not to main |

## Overlaps to settle together

No decision has been made yet; Hila will agree with Eldad which version to keep
before asking for any of these to be integrated.

- COMBO-H and Eldad's SCORING (merged): both add a timed coin combo.
- Space dash in ENEMY-TYPES and Eldad's DASH (Shift, merged): two dashes; Hila's
  destroys enemies.
- POWERUPS-H and Eldad's POWERUPS (implementing): both add a shield and a magnet;
  Hila's also has Speed.
- DIFFICULTY and Eldad's SETTINGS / LEVELS (done): Hila's menu multiplies drone
  speed, drone count and round time.
- RAGE: Hila has no rage feature. The overlay fits ENEMY-TYPES as long as it only
  controls velocity for the enraged enemy, after normal enemy movement.

Hila's branches edit the pre-rewrite game.js, so they cannot merge into main as they
are. Before porting anything onto the current core, Hila will list the exact hooks
or file handoffs she needs here.
