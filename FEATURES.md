# Shared feature board

**Single writer: Eldad coordinating AI.** Hila writes `HILA_STATUS.md`; Eldad reads
and mirrors her updates here. Both AIs read both files. Do not rewrite the other
AI's status file. This avoids simultaneous edits to this board.

Both partners and all agents: read the latest remote version before work. Claim
and push ownership BEFORE editing. Different worktrees isolate files but do not
prevent two agents from implementing the same feature. Keep this file current.

Statuses: `planned`, `implementing`, `awaiting integration`, `done`, `blocked`,
`failed`. `done` requires verification in the combined game.

| ID | Feature | Owner | Status | Branch / owned files | Verification / notes |
| --- | --- | --- | --- | --- | --- |
| SETUP | Clone and first test push | Eldad coordinator | done | main; docs/eldad-access-check.md | Pushed 38f725c; Hila accepted collaborator invitation |
| VISUALS | Player/enemy sprites and distinct enemy colors | Eldad visuals agent | done | eldad/visuals; features/visuals.js, style.css | Browser sprite layout checked; keep Hila's enemy types and behaviors separate; expose reusable sprite factories |
| SETTINGS | Controls for starting creature count and lives | Eldad coordinator | done | eldad/core; game.js, settings.js, index.html | Apply on a new round; validate/clamp values |
| LEVELS | Levels get harder over time | Eldad coordinator | done | eldad/core; game.js, settings.js, index.html | Scale speed and add enemies with caps; preserve enemy type metadata |
| AUDIO | Background music and action sounds | Eldad audio agent | done | eldad/audio; features/audio.js | Offline synthesis; gesture unlock, mute and volume; restart cleanup |
| LIVES | Life system and hit invulnerability | Eldad lives agent | done | eldad/lives; features/lives.js, tests/lives.test.cjs | Multi-life hits, temporary immunity, last-life game over, clean restart |
| ENEMY-TYPES | Chaser, Patroller, Zipper behaviors | Hila's AI | awaiting integration | feat/enemy-types; 667692d | Pushed on old core; Hila owns port to optional enemy module and will request hooks in HILA_STATUS.md |
| DASH | Shift dash with cooldown and touch dash button | Eldad abilities agent | awaiting integration | eldad/dash; features/abilities.js, tests/abilities.test.cjs | Class with active-time cooldown; no changes to Hila's enemies |
| SCORING | Coin combos, personal bests and achievements | Eldad scoring agent | awaiting integration | eldad/scoring; features/scoring.js, tests/scoring.test.cjs | Separate class; defensive local storage, settings-specific best |
| TOUCH | Pointer/touch directional controls | Eldad controls agent | awaiting integration | eldad/touch; features/controls.js, features/controls.css, tests/controls.test.cjs | Multi-pointer, release/cancel/blur cleanup, keyboard support stays in core |
| ROUND-STATE | OOP round state and integration | Eldad coordinator | implementing | eldad/polish; features/round.js, tests/round.test.cjs, game.js, index.html, settings.js, style.css | Separate state from rendering; wire the second batch |

## Additional user requests (claimed before implementation)

| ID | Feature | Owner | Status | Branch / owned files | Verification / notes |
| --- | --- | --- | --- | --- | --- |
| TIME-BONUS | Every coin adds 3 seconds | Eldad coordinator | implementing | eldad/arcade-core; features/round.js, tests/round.test.cjs, features/scoring.js, features/abilities.js, tests/scoring.test.cjs, game.js, index.html, settings.js, features/audio.js, tests/audio.test.cjs, README.md, docs/engagement-design.md | Active elapsed difficulty continues; remaining time increases |
| REACTIONS | Fast/slow coin reactions, animations and funny voice | Eldad feedback agent | awaiting integration | eldad/reactions; features/reactions.js, features/reactions.css, tests/reactions.test.cjs | WOW/YOU SUPER on fast chains; playful are-you-awake after slow gaps; cooldowns, pause/restart cleanup, local voice only |
| MISSIONS | Short mastery goals and completion badges | Eldad missions agent | awaiting integration | eldad/missions; features/missions.js, tests/missions.test.cjs | Visible finite goals; coin/level/dash progress; no enemy behavior |
| POWERUPS | Collectible shield and coin magnet | Eldad powerups agent | awaiting integration | eldad/powerups; features/powerups.js, tests/powerups.test.cjs | Active-time expiry, one-hit shield and short magnet; do not alter Hila's enemy types |
| ARENA | Level palettes and starting obstacles | Eldad arena agent | awaiting integration | eldad/arena; features/arena.js, tests/arena.test.cjs | Clear routes, player/enemy wall collisions, safe-spawn query |
| RAGE | One temporary red chasing enemy with angry sound | Eldad rage agent | awaiting integration | eldad/rage; features/rage.js, tests/rage.test.cjs | Hila confirmed no rage overlap in da33ad2; additive overlay after normal enemy movement |

## Shared integration boundary

First batch merged and checked; Eldad continues to own `game.js`, `settings.js`, and `index.html` while wiring the
above features. Rage is an optional status-effect overlay, not an enemy type: it runs AFTER Hila's
normal movement update for one marked enemy only (`enemy.getData("enraged")`).
Hila may skip marked enemies while rage controls their velocity, or request that
this overlay be disabled if her module already implements rage.

Hila: implement enemy varieties in a separate module (suggested
`features/enemies.js`) and describe required wiring in HILA_STATUS.md, or coordinate a handoff
before editing those shared files. Do not overwrite another owner's integration.
See `docs/feature-contract.md` for stable integration hooks. Core ownership is
released after integration is checked; this does not reserve shared files forever.

## Hila handoff received (da33ad2)

| ID | Feature | Owner | Status | Branch / commit | Integration decision |
| --- | --- | --- | --- | --- | --- |
| HILA-GROUNDWORK | Original shared helpers | Hila | awaiting integration | hila/groundwork 1466aa0 | Earlier core; retain current state classes, request specific missing hooks |
| DIFFICULTY | Easy / Normal / Hard | Hila | awaiting integration | feat/difficulty 8a0f470 | Port as per-round config selection; keep existing level progression |
| MULTIPLAYER | Local two-player mode | Hila | awaiting integration | feat/local-multiplayer 6365737 | Needs explicit player/lives/coin contracts before core handoff |
| NEAR-MISS | Close-call bonus | Hila | awaiting integration | feat/near-miss 8a2e648 | Needs shared score-award hook; do not treat bonus as coin/time reward |
| SHOOTING | F-key directional shooting | Hila | awaiting integration | feat/shooting 0ef0686 | Preserve branch; depends on adapted enemy kill/respawn contract |
| COMBO-H | Alternate combo multiplier | Hila | awaiting integration | feat/combo 3928144 | Overlaps current SCORING; propose retaining existing combined-game implementation |
| POWERUPS-H | Shield / speed / magnet | Hila | awaiting integration | feat/powerups 1b5f212 | Keep existing shield/magnet; propose adding Hila's speed pickup through module |
| HILA-INTEGRATION | Combined partner branch | Hila | implementing | integration/all-features (not yet remote) | Hila's isolated playtest; no blind whole-core merge |
| FINAL-QA | Integration cleanup and coin reward regression checks | Eldad integration agent | implementing | eldad/final-integration; game.js, tests/integration.test.cjs | Review found rage cleanup must run on game over; fix before next gameplay push |

Eldad's proposed overlap resolution: keep the existing Shift/touch dash, scoring
combo, shield/magnet and lives systems. Add Hila's unique enemy behaviors first;
coordinate dash-kill and F-shooting through explicit callbacks. Ordinary enemy
contact must retain the multi-life system. Hila should confirm or suggest changes
in HILA_STATUS.md before overlapping ports. Eldad is finishing integration QA and
will release the shared core at the next verified checkpoint. No partner branch
is discarded or overwritten.

## Checks, failures, and fixes

- Third batch module checks passed: reactions 9, missions 6, special-coin powerups
  14, arena 6, rage 9. Root timer tests confirm each coin adds exactly three seconds
  and a death after the original 60s is not misreported as round survival.
- Reactions test initially expected an already-expired reward to remain; corrected
  its expectation. Active-time expiration behavior was retained.
- Latest partner check: Hila pushed da33ad2 to main plus eight feature/groundwork
  branches. No PRs. All gameplay branches use the earlier core; preserve them and
  port agreed features through modules instead of replacing current game.js.


- Review also found Phaser global arrow-key capture blocking native settings widgets.
  Removed global capture; only the focused arena prevents arrow scrolling. Browser
  field/volume keyboard regression checks pending.
- Independent review caught keyboard shortcuts being ignored after New round/Pause
  left a button focused. Fixed both handlers to return focus to the arena; browser
  regression check passed (Pause button, then P resumed the game). This was an integration issue, not a merge conflict.

- Second batch: dash 7 tests, scoring 10 tests, touch 7 tests passed before integration.
- Round-model test initially failed because it compared a floating-point multiplier
  with exact equality (1.1400000000000001 versus 1.14). Fixed the assertion to use
  numeric tolerance; all 5 round-state tests pass. Combined browser checks pending.

- Setup initially blocked by the agent's network sandbox. Full access became
  effective in the next turn; clone, GitHub authentication, and test push passed.
- Authored runtime inspected before execution: local scripts only, no backend or
  network requests. Vendored Phaser matches its official CDN byte for byte.
  SHA-256: e92ddef111ba42e92d316979c732311757093688ea1810591cb7aa2858eba7a7.
- First batch checked: all 13 Node tests pass. Chrome showed 6 configured enemies/5 lives, progression to level 6/11 enemies, 0-life game over, restart restoring lives, pause, distinct sprites, gesture-unlocked audio controls, and no console errors. Audio output device listening remains a human check.

## Shared checkpoint and report

Initial template: `776faeef130e5281916ce8eff9f940c2c98c9573`.
Eldad's access-check commit: `38f725c`. Hila should push a small change in her own
file; then both partners synchronize and record the common checkpoint here.
Agree on the lab's start/end timestamps (including timezone) for both reports.

## Handoff notes

Hila's AI: pull main, read this board and AGENTS.md, then put ENEMY-TYPES
ownership/status and hook requests in HILA_STATUS.md. Do not edit FEATURES.md.
Eldad checks your status before every integration and mirrors it here.
Both sides update their own status files after milestones and record failed checks.
