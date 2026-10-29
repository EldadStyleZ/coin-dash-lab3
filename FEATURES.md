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
| ENEMY-TYPES | Chaser, Patroller, Zipper behaviors | Hila's AI | done | feat/enemy-types; 667692d | Ported from 667692d to features/enemies.js; all three types tested; original branch retained |
| DASH | Shift dash with cooldown and touch dash button | Eldad abilities agent | done | eldad/dash; features/abilities.js, tests/abilities.test.cjs | Class with active-time cooldown; no changes to Hila's enemies |
| SCORING | Coin combos, personal bests and achievements | Eldad scoring agent | done | eldad/scoring; features/scoring.js, tests/scoring.test.cjs | Separate class; defensive local storage, settings-specific best |
| TOUCH | Pointer/touch directional controls | Eldad controls agent | done | eldad/touch; features/controls.js, features/controls.css, tests/controls.test.cjs | Multi-pointer, release/cancel/blur cleanup, keyboard support stays in core |
| ROUND-STATE | OOP round state and integration | Eldad coordinator | done | eldad/polish; features/round.js, tests/round.test.cjs, game.js, index.html, settings.js, style.css | Separate state from rendering; wire the second batch |

## Additional user requests (claimed before implementation)

| ID | Feature | Owner | Status | Branch / owned files | Verification / notes |
| --- | --- | --- | --- | --- | --- |
| TIME-BONUS | Every coin adds 3 seconds | Eldad coordinator | done | eldad/arcade-core; features/round.js, tests/round.test.cjs, features/scoring.js, features/abilities.js, tests/scoring.test.cjs, game.js, index.html, settings.js, features/audio.js, tests/audio.test.cjs, README.md, docs/engagement-design.md | Active elapsed difficulty continues; remaining time increases |
| REACTIONS | Fast/slow coin reactions, animations and funny voice | Eldad feedback agent | done | eldad/reactions; features/reactions.js, features/reactions.css, tests/reactions.test.cjs | WOW/YOU SUPER on fast chains; playful are-you-awake after slow gaps; cooldowns, pause/restart cleanup, local voice only |
| MISSIONS | Short mastery goals and completion badges | Eldad missions agent | done | eldad/missions; features/missions.js, tests/missions.test.cjs | Visible finite goals; coin/level/dash progress; no enemy behavior |
| POWERUPS | Collectible shield and coin magnet | Eldad powerups agent | done | eldad/powerups; features/powerups.js, tests/powerups.test.cjs | Active-time expiry, one-hit shield and short magnet; do not alter Hila's enemy types |
| ARENA | Level palettes and starting obstacles | Eldad arena agent | done | eldad/arena; features/arena.js, tests/arena.test.cjs | Clear routes, player/enemy wall collisions, safe-spawn query |
| RAGE | One temporary red chasing enemy with angry sound | Eldad rage agent | done | eldad/rage; features/rage.js, tests/rage.test.cjs | Hila confirmed no rage overlap in da33ad2; additive overlay after normal enemy movement |

## Shared integration boundary

All requested feature batches and partner ports are merged and checked. Shared
core files are released after this checkpoint; claim future edits before starting. Rage is an optional status-effect overlay, not an enemy type: it runs AFTER Hila's
normal movement update for one marked enemy only (`enemy.getData("enraged")`).
Hila may skip marked enemies while rage controls their velocity, or request that
this overlay be disabled if her module already implements rage.

Hila: implement enemy varieties in a separate module (suggested
`features/enemies.js`) and describe required wiring in HILA_STATUS.md, or coordinate a handoff
before editing those shared files. Do not overwrite another owner's integration.
See `docs/feature-contract.md` for stable integration hooks. Core integration is complete; shared files are released for future explicit claims.
Fetch this checkpoint before starting any new work.

## Hila handoff received (da33ad2)

| ID | Feature | Owner | Status | Branch / commit | Integration decision |
| --- | --- | --- | --- | --- | --- |
| HILA-GROUNDWORK | Original shared helpers | Hila | done | hila/groundwork 1466aa0 | Earlier core; retain current state classes, request specific missing hooks |
| DIFFICULTY | Easy / Normal / Hard | Hila | done | feat/difficulty 8a0f470 | Integrated per-round config selection; keeps existing level progression |
| MULTIPLAYER | Local two-player mode | Hila | done | feat/local-multiplayer 6365737 | Integrated separate lives/scores/controls, shared timer; last survivor continues |
| NEAR-MISS | Close-call bonus | Hila | done | feat/near-miss 8a2e648 | Integrated awardPoints hook; bonuses add score without coin/time credit |
| SHOOTING | F-key directional shooting | Hila | done | feat/shooting 36a22b0 | Ported F/L shots, Space/Enter slicing, slice and miss sounds; original source retained |
| COMBO-H | Alternate combo multiplier | Hila | done | feat/combo 3928144 | Overlaps current SCORING; retained existing combined-game implementation |
| POWERUPS-H | Shield / speed / magnet | Hila | done | feat/powerups 1b5f212 | Keep existing shield/magnet; added Hila's speed pickup through module |
| HILA-INTEGRATION | Combined partner branch | Hila | done | integration/all-features ccf11c6 (pushed) | Inspected as donor integration reference; gameplay ported into current core, branch retained |
| FINAL-QA | Integration cleanup and coin reward regression checks | Eldad integration agent | done | eldad/final-integration; game.js, tests/integration.test.cjs | Review found rage cleanup must run on game over; fix before next gameplay push |

User authorized Eldad to integrate all pushed Hila features. Integration ownership
now transfers to Eldad; Hila keeps authorship and her branches. Overlap resolution: keep the existing Shift/touch dash, scoring
combo, shield/magnet and lives systems. Add Hila's unique enemy behaviors first;
coordinate dash-kill and F-shooting through explicit callbacks. Ordinary enemy
contact must retain the multi-life system. Hila should push completed work and update HILA_STATUS.md; Eldad ports it onto the current core. Eldad completed integration QA and released the shared core at this checkpoint. No partner branch
is discarded or overwritten.

## Partner integration assignments (user-authorized handoff)

| Work | Owner | Status | Branch / exclusive files |
| --- | --- | --- | --- |
| Port Hila enemy types, dash kills and shooting | Eldad enemy port agent | done | eldad/hila-enemies; features/enemies.js, features/combat.js, tests/enemies.test.cjs, tests/combat.test.cjs |
| Port difficulty, near misses, speed pickup; adapt pickups to both players | Eldad extras port agent | done | eldad/hila-extras; features/difficulty.js, features/near-miss.js, features/powerups.js, tests/difficulty.test.cjs, tests/near-miss.test.cjs, tests/powerups.test.cjs |
| Port 2P with per-player lives/scores; integrate all ports | Eldad coordinator | done | eldad/pair-core; game.js (after FINAL-QA handoff), index.html, settings.js, style.css, features/multiplayer.js, features/abilities.js, features/scoring.js, features/rage.js, features/audio.js, tests/audio.test.cjs, tests/multiplayer.test.cjs, tests/abilities.test.cjs, tests/scoring.test.cjs, tests/integration.test.cjs (after FINAL-QA), README.md, docs/feature-contract.md |

Keep one dash, combo and power-up system. Bring Hila's three enemy behaviors,
per-type kill points, F shooting, speed pickups, near misses, difficulty presets,
and two-player mode into those systems. Preserve each partner's source commits
and credit in port commits. Integrate serially and test the combined game.

- Multiplayer module delegated to Eldad multiplayer agent on `eldad/hila-multiplayer`:
  exclusive `features/multiplayer.js`, `features/lives.js`, `tests/multiplayer.test.cjs`.
  Root retains abilities/scoring/core wiring. Per-player lives, scores and knockouts.
- User specifically requested preserving Claude's Space samurai slicing. Latest
  shooting source is b19a23a, including shot and ninja-slice sounds. Keep Space
  dash/slice and its feedback, with F shots as a separate action; no feature deletion.

## Checks, failures, and fixes

- Third batch module checks passed: reactions 9, missions 6, special-coin powerups
  14, arena 6, rage 9. Timer and actual-scene tests confirm each coin adds exactly three seconds
  and a death after the original 60s is not misreported as round survival.
- Reactions test initially expected an already-expired reward to remain; corrected
  its expectation. Active-time expiration behavior was retained.
- Latest partner check: Hila pushed da33ad2 to main plus eight feature/groundwork
  branches. No PRs. All gameplay branches use the earlier core; preserve them and
  port agreed features through modules instead of replacing current game.js.


- Review also found Phaser global arrow-key capture blocking native settings widgets.
  Removed global capture; only the focused arena prevents arrow scrolling. Browser
  field/volume keyboard regression checks passed. Final Space/arrow playtest found
  arena scroll prevention was cancelling events before Phaser received them; moved
  it after Phaser at window. Space slice, P2 arrows and native form keys verified.
- Independent review caught keyboard shortcuts being ignored after New round/Pause
  left a button focused. Fixed both handlers to return focus to the arena; browser
  regression check passed (Pause button, then P resumed the game). This was an integration issue, not a merge conflict.

- Second batch: dash 7 tests, scoring 10 tests, touch 7 tests passed before integration.
- Round-model test initially failed because it compared a floating-point multiplier
  with exact equality (1.1400000000000001 versus 1.14). Fixed the assertion to use
  numeric tolerance; all 7 final round-state tests pass. Combined browser checks passed.

- Setup initially blocked by the agent's network sandbox. Full access became
  effective in the next turn; clone, GitHub authentication, and test push passed.
- Authored runtime inspected before execution: local scripts only, no backend or
  network requests. Vendored Phaser matches its official CDN byte for byte.
  SHA-256: e92ddef111ba42e92d316979c732311757093688ea1810591cb7aa2858eba7a7.
- First batch checked: all 13 Node tests pass. Chrome showed 6 configured enemies/5 lives, progression to level 6/11 enemies, 0-life game over, restart restoring lives, pause, distinct sprites, gesture-unlocked audio controls, and no console errors. Audio output device listening remains a human check.

## Shared checkpoint and report

Initial template: `776faeef130e5281916ce8eff9f940c2c98c9573`.
Eldad's access-check commit: `38f725c`. Hila pushed da33ad2 and her feature branches. All source branches through
36a22b0 have been ported; source history and coauthor credit are preserved.
Agree on the lab's start/end timestamps (including timezone) for both reports.

## Handoff notes

Hila's AI: pull main, read this board and AGENTS.md, then put ENEMY-TYPES
ownership/status and hook requests in HILA_STATUS.md. Do not edit FEATURES.md.
Eldad checks your status before every integration and mirrors it here.
Both sides update their own status files after milestones and record failed checks.

## Submission checkpoint

- All requested Eldad and Hila gameplay features integrated; **136 Node tests pass**.
- Independent integration reviews passed. Browser checks: two players, separate
  controls/lives/scores, easy timer, F/L shots, Space/Enter slices, enemy kill
  points, no coin-time reward for kills, pause, special-coin spawn, and no console
  errors. Prior checks cover +3s coin rewards, fast WOW reactions, walls, level
  palettes, mobile controls and restart. Audio device listening remains manual.
- Final regression fixes: immediate rage restoration on game over; native form
  controls retain arrows; arena Space/arrows reach Phaser before scroll suppression.
- Overlaps resolved into one dash, combo and power-up system. Space samurai slicing
  is preserved, including hit slice and missed-swing sounds. Hila's old-core branch
  histories are retained after manual ports; their old game.js does not overwrite
  the combined implementation. HILA_STATUS.md remains Hila's untouched handoff.
- Final paired HTML report still requires Hila's derived JSON and a common report
  time window. Generated reports remain ignored; no raw logs are published.

## Playtest follow-up

| ID | Feature | Owner | Status | Branch / owned files | Verification |
| --- | --- | --- | --- | --- | --- |
| GAME-FOCUS | Fixed game viewport, gear settings dialog, Space scroll prevention | Eldad coordinator | done | eldad/game-focus; game.js, index.html, style.css, features/game-ui.js, tests/game-ui.test.cjs, README.md | User reproduced Space page scrolling outside focused canvas; keep native settings input usable, pause while dialog open |


- GAME-FOCUS verified: **143 tests pass**. Browser confirms body-focused Space
  activates slicing without scroll; viewport scrollTop stays 0. Gear opens a modal
  and pauses the game; Close/Escape restores focus and the previous pause state.
  Settings arrows and volume keys remain native; Apply starts a new round.
  Desktop and 390×844 mobile layouts fit with no page overflow. No console errors.
  Follow-up ownership released after this verified push.


## Public game hosting

| ID | Feature | Owner | Status | Branch / owned files | Verification |
| --- | --- | --- | --- | --- | --- |
| PAGES | Public GitHub Pages game URL | Eldad coordinator | done | eldad/pages; .nojekyll, README.md | Publish main root, verify HTTPS and local asset paths online |


- PAGES deployed successfully over HTTPS from `main` root. Public URL:
  https://eldadstylez.github.io/coin-dash-lab3/ . Build/deployment run 40857013141
  succeeded. Live browser check loaded sprites and UI, started a fresh round,
  performed Space slicing and pause, and reported no console errors.
  `.nojekyll` serves the existing static assets directly; no gameplay changes.


## Combat playtest change

| ID | Feature | Owner | Status | Branch / owned files | Verification |
| --- | --- | --- | --- | --- | --- |
| KILL-CHAINS | Stationary sword strikes, instant kill reset, miss cooldown and kill combos | Eldad combat agent | implementing | eldad/kill-chains; features/abilities.js, features/combat.js, tests/abilities.test.cjs, tests/combat.test.cjs | Remove movement boost; independent P1/P2 cooldowns, avoid wall hits and duplicate rewards |
| SLOW-RAGE | Angry enemy at least 50% slower | Eldad rage agent | implementing | eldad/slow-rage; features/rage.js, tests/rage.test.cjs | Halve the previous final chase speed, including the cap; normal speed restoration stays intact |
| STRIKE-UI | Update core, touch controls, missions and help to strike controls | Eldad coordinator | implementing | eldad/strike-ui; game.js, index.html, style.css, features/multiplayer.js, features/controls.js, features/controls.css, features/missions.js, tests/controls.test.cjs, tests/missions.test.cjs, tests/multiplayer.test.cjs, tests/integration.test.cjs, README.md, docs/feature-contract.md | Preserve coin bonus and focused settings UI; publish combined result to Pages |


| ID | Feature | Owner | Status | Branch / owned files | Verification |
| --- | --- | --- | --- | --- | --- |
| FUN-FEEDBACK | Funnier, less frequent captions and sounds | Eldad feedback agent | implementing | eldad/fun-feedback; features/reactions.js, features/reactions.css, features/audio.js, tests/reactions.test.cjs, tests/audio.test.cjs | Throttle speech/callouts, preserve reward floats and mute/cleanup; playful offline sounds |
| RESPONSIVE-POLISH | Responsive desktop/mobile/landscape and render overhead | Eldad coordinator | implementing | eldad/strike-ui; style.css, index.html, game.js, README.md | Browser dimensions, visible controls, bounded HUD writes; no unmeasured FPS claim |
