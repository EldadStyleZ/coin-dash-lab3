# Shared feature board

Both partners and all agents: read the latest remote version before work. Claim
and push ownership BEFORE editing. Different worktrees isolate files but do not
prevent two agents from implementing the same feature. Keep this file current.

Statuses: `planned`, `implementing`, `awaiting integration`, `done`, `blocked`,
`failed`. `done` requires verification in the combined game.

| ID | Feature | Owner | Status | Branch / owned files | Verification / notes |
| --- | --- | --- | --- | --- | --- |
| SETUP | Clone and first test push | Eldad coordinator | done | main; docs/eldad-access-check.md | Pushed 38f725c; Hila accepted collaborator invitation |
| VISUALS | Player/enemy sprites and distinct enemy colors | Eldad visuals agent | awaiting integration | eldad/visuals; features/visuals.js, style.css | Keep Hila's enemy types and behaviors separate; expose reusable sprite factories |
| SETTINGS | Controls for starting creature count and lives | Eldad coordinator | implementing | eldad/core; game.js, settings.js, index.html | Apply on a new round; validate/clamp values |
| LEVELS | Levels get harder over time | Eldad coordinator | implementing | eldad/core; game.js, settings.js, index.html | Scale speed and add enemies with caps; preserve enemy type metadata |
| AUDIO | Background music and action sounds | Eldad audio agent | awaiting integration | eldad/audio; features/audio.js | Offline synthesis; gesture unlock, mute and volume; restart cleanup |
| LIVES | Life system and hit invulnerability | Eldad lives agent | awaiting integration | eldad/lives; features/lives.js, tests/lives.test.cjs | Multi-life hits, temporary immunity, last-life game over, clean restart |
| ENEMY-TYPES | Enemy varieties / behaviors | Hila's AI | implementing | feat/enemy-types; game.js (own methods), settings.js (`enemyTypes` section) | Chaser / Patroller / Zipper plus Space dash that destroys enemies for per-type points; contact without dash still ends the round |
| HILA-GROUNDWORK | Shared helpers for parallel features | Hila coordinator | awaiting integration | hila/groundwork; game.js, settings.js | getDroneSpeed/Count, getRoundSeconds, addScore + `score` event, `updaters` and `hudItems` hooks, `difficulty` settings. Default play unchanged (checked in browser). Touches Eldad's core files: coordinate before merging to main |
| DIFFICULTY | Easy / Normal / Hard start screen | Hila's AI | implementing | feat/difficulty; game.js (own methods), settings.js (`difficulty`) | Multipliers via groundwork helpers; distinct from SETTINGS (starting count/lives inputs) |
| POWERUPS | Shield, Speed and Magnet pickups | Hila's AI | implementing | feat/powerups; game.js (own methods), settings.js (`powerups`) | Spawn ~every 15s, last 5s; active power-up and countdown in HUD |
| MULTIPLAYER | Optional local 2-player mode | Hila's AI | implementing | feat/local-multiplayer; game.js (own methods), settings.js (`multiplayer`) | M toggles 1P/2P; P1 WASD, P2 arrows, separate colours and scores |
| COMBO | Combo multiplier for quick coin pickups | Hila's AI | implementing | feat/combo; game.js (own methods), settings.js (`combo`) | Pickups within the combo window raise a capped multiplier shown in HUD |
| NEAR-MISS | Close-call bonus near drones | Hila's AI | implementing | feat/near-miss; game.js (own methods), settings.js (`nearMiss`) | Small bonus and popup for passing close to a drone without touching it |

## Shared integration boundary

Eldad currently owns `game.js`, `settings.js`, and `index.html` while wiring the
above features. Hila: implement enemy varieties in a separate module (suggested
`features/enemies.js`) and describe required wiring here, or coordinate a handoff
before editing those shared files. Do not overwrite another owner's integration.
See `docs/feature-contract.md` for stable integration hooks. Core ownership is
released after integration is checked; this does not reserve shared files forever.

## Checks, failures, and fixes

- Setup initially blocked by the agent's network sandbox. Full access became
  effective in the next turn; clone, GitHub authentication, and test push passed.
- Authored runtime inspected before execution: local scripts only, no backend or
  network requests. Vendored Phaser matches its official CDN byte for byte.
  SHA-256: e92ddef111ba42e92d316979c732311757093688ea1810591cb7aa2858eba7a7.
- Module checks passed: lives 8 tests, audio 5 lifecycle tests, sprite factories smoke-tested. Combined browser playtest pending; none are marked done yet.

## Shared checkpoint and report

Initial template: `776faeef130e5281916ce8eff9f940c2c98c9573`.
Eldad's access-check commit: `38f725c`. Hila should push a small change in her own
file; then both partners synchronize and record the common checkpoint here.
Agree on the lab's start/end timestamps (including timezone) for both reports.

## Handoff notes

Hila's AI: pull main, read this board, fill in ENEMY-TYPES ownership/status and
coordinate any shared-file changes. Both sides update their rows after each
meaningful milestone and record failed checks in the section above.
