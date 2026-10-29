# Shared feature board

Both partners and all agents: read the latest remote version before work. Claim
and push ownership BEFORE editing. Different worktrees isolate files but do not
prevent two agents from implementing the same feature. Keep this file current.

Statuses: `planned`, `implementing`, `awaiting integration`, `done`, `blocked`,
`failed`. `done` requires verification in the combined game.

| ID | Feature | Owner | Status | Branch / owned files | Verification / notes |
| --- | --- | --- | --- | --- | --- |
| SETUP | Clone and first test push | Eldad coordinator | done | main; docs/eldad-access-check.md | Pushed 38f725c; Hila accepted collaborator invitation |
| VISUALS | Player/enemy sprites and distinct enemy colors | Eldad visuals agent | implementing | eldad/visuals; features/visuals.js, style.css | Keep Hila's enemy types and behaviors separate; expose reusable sprite factories |
| SETTINGS | Controls for starting creature count and lives | Eldad coordinator | implementing | eldad/core; game.js, settings.js, index.html | Apply on a new round; validate/clamp values |
| LEVELS | Levels get harder over time | Eldad coordinator | implementing | eldad/core; game.js, settings.js, index.html | Scale speed and add enemies with caps; preserve enemy type metadata |
| AUDIO | Background music and action sounds | Eldad audio agent | implementing | eldad/audio; features/audio.js | Offline synthesis; gesture unlock, mute and volume; restart cleanup |
| LIVES | Life system and hit invulnerability | Eldad lives agent | implementing | eldad/lives; features/lives.js, tests/lives.test.cjs | Multi-life hits, temporary immunity, last-life game over, clean restart |
| ENEMY-TYPES | Enemy varieties / behaviors | Hila's AI | planned | Hila to fill in branch and owned files | Reserved for Hila by the pair; Eldad must not implement enemy varieties |

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
- Feature implementation and playtesting pending. Do not present these as done.

## Shared checkpoint and report

Initial template: `776faeef130e5281916ce8eff9f940c2c98c9573`.
Eldad's access-check commit: `38f725c`. Hila should push a small change in her own
file; then both partners synchronize and record the common checkpoint here.
Agree on the lab's start/end timestamps (including timezone) for both reports.

## Handoff notes

Hila's AI: pull main, read this board, fill in ENEMY-TYPES ownership/status and
coordinate any shared-file changes. Both sides update their rows after each
meaningful milestone and record failed checks in the section above.
