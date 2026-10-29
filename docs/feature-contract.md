# Feature integration contract

Classic browser scripts; no build step, downloads, or backend. Core loads modules
before `game.js`. Every scene restart creates new state and cleans up old listeners.

## Visuals (owned by Eldad visuals agent)

`window.CoinDashVisuals` provides:
- `prepare(scene)` generates reusable local textures once (check texture keys).
- `createPlayer(scene, x, y)` returns a Phaser Sprite (no physics added yet).
- `createEnemy(scene, x, y, index, type = 'drone')` returns a Sprite with visibly
  distinct colors; retain type/index data for Hila's future enemy behaviors.
- `createCoin(scene, x, y)` returns a Sprite.

Core adds Arcade bodies, world bounds, sizes and velocities. Factories must not
add their own physics or change enemy movement. Set suitable display sizes (~24px
player/enemy, ~18px coin). Color by index until Hila supplies explicit types.

## Lives (owned by Eldad lives agent)

`window.CoinDashLives.create(scene, {maxLives, invulnerabilityMs})` returns
`{hit(time), update(time), destroy(), get remaining()}`. `time` is active round
time in milliseconds (`scene.runTime`), not wall time. `hit()` returns
`{damaged, dead, remaining}`. Repeated collisions during immunity do not damage.
Lives module updates `#lives-status` text and player blinking/alpha; restore alpha
on destroy. It must not finish the scene or pause physics; core owns game over.
May expose a pure state class for Node tests. DOM/storage absence must not break
pure state tests. Root calls create after player creation, update each active frame,
and destroy on scene shutdown. Config defaults to three lives and 1500ms immunity.

## Audio (owned by Eldad audio agent)

`window.CoinDashAudio.create(scene)` returns
`{play(action), setPaused(paused), destroy()}`. Supported actions: `coin`, `hit`,
`level`, `gameover`. Root calls these at the corresponding events. Module builds
controls inside `#audio-controls`, with music/sound toggle and volume. Synthesize
music and effects locally using Web Audio; audio starts only after a gesture.
Release oscillators/timers/listeners on destroy. If Web Audio is unavailable,
gameplay must continue. Avoid a second AudioContext on every scene restart.

## Core (owned by Eldad coordinator)

Scene fields: `config` (effective per-round settings), `player`, `coin`, `drones`
(Arcade group), `runTime` (active elapsed milliseconds), `score`, `level`,
`finished`, `paused`. Scene helpers: `spawnDrone(index, type = 'drone')`,
`finish(reason)`, `restartRound()`, `setPaused(paused)`.

DOM: `#game`, `#creature-count`, `#starting-lives`, `#start-game`, `#pause-game`,
`#score-value`, `#level-value`, `#time-value`, `#enemy-value`, `#lives-status`,
`#audio-controls`, `#game-status`. Core owns these elements except audio container
contents and lives text. Canvas remains 800x500 with responsive FIT scaling.

## Hila's enemy types (reserved; suggested adapter)

An optional `window.CoinDashEnemies` module may provide:
`decorate(scene, enemy, index, level)` after each enemy's body is ready,
`update(scene, delta)` each active frame, and `levelChanged(scene, level)` after
baseline difficulty changes. Enemy data can include `type` and `speedMultiplier`.
Use `enemy.setData('speedMultiplier', n)` for baseline speed scaling (default 1).
Root keeps existing enemies, stores metadata, and scales each enemy's velocity
direction without replacing their objects when leveling. Coordinate other hooks
in FEATURES.md before changing core. This adapter is an offer, not an implemented
enemy-variety feature.
