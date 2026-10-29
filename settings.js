// Keep tuning separate from game behaviour so features can be developed independently.
window.COIN_DASH = {
  width: 800,
  height: 500,
  roundSeconds: 45,
  playerSpeed: 240,
  droneSpeed: 105,
  droneCount: 3,
  colors: { background: 0x101c31, player: 0x71e8ce, coin: 0xffd166, drone: 0xff657a },
  // Multipliers on droneSpeed, droneCount and roundSeconds; 'normal' is the original game.
  difficulty: {
    default: 'normal',
    easy: { droneSpeed: 0.75, droneCount: 0.67, roundSeconds: 1.34 },
    normal: { droneSpeed: 1, droneCount: 1, roundSeconds: 1 },
    hard: { droneSpeed: 1.3, droneCount: 1.67, roundSeconds: 0.8 }
  },
  // Difficulty start screen: keys 1, 2, 3... pick the options above in order; this key reopens it.
  difficultyMenu: { key: 'ESC', keyLabel: 'Esc' },
  // Enemy types, spawned in `order` (cycling) up to the drone count. speed multiplies
  // getDroneSpeed(); points are awarded for dashing through one. Destroyed enemies
  // respawn after respawnMs, at least spawnDistance px from the player.
  enemyTypes: {
    order: ['chaser', 'patroller', 'zipper'],
    chaser: { speed: 0.6, color: 0xff657a, size: 26, points: 5 },
    patroller: { speed: 1.2, color: 0xff9f1c, size: 30, points: 3, range: 240 },
    zipper: { speed: 2, color: 0xc77dff, size: 26, points: 10 },
    respawnMs: 3000,
    spawnDistance: 200,
    popupMs: 700
  },
  // Space dash: speed (px/s) for durationMs, then cooldownMs before it is ready again.
  dash: { speed: 650, durationMs: 180, cooldownMs: 1500, color: 0xffffff, trailMs: 160 }
};
