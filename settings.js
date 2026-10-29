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
  dash: { speed: 650, durationMs: 180, cooldownMs: 1500, color: 0xffffff, trailMs: 160 },
  // Power-up pickups. Collecting one replaces any active effect and restarts the timer.
  powerups: {
    firstSpawn: 7,          // seconds into the round before the first pickup
    spawnEvery: 15,         // seconds between pickups
    lifetime: 8,            // seconds an uncollected pickup stays before despawning
    duration: 5,            // seconds an effect lasts
    radius: 12,
    minPlayerDistance: 120, // pickups never spawn this close to the player
    speedMultiplier: 1.6,   // player speed while Speed is active
    magnetRange: 300,       // coins within this many pixels are pulled in...
    magnetPull: 300,        // ...at this speed (pixels per second)
    shieldGlow: 0x8fd3ff,
    kinds: {
      shield: { label: 'Shield', letter: 'S', color: 0x3d7dff },
      speed: { label: 'Speed', letter: '»', color: 0xff9f43 },
      magnet: { label: 'Magnet', letter: 'M', color: 0xb36bff }
    }
  },
  // Combo: a coin within windowMs of the previous one raises the multiplier (capped).
  combo: {
    windowMs: 2000,
    maxMultiplier: 5,
    barLength: 5,
    popupMs: 700,
    popupRise: 36,
    colors: { popup: '#ffd166', popupStroke: '#101c31' }
  },
  // Close-call bonus: get within `distance` px (edge to edge) of a drone, then leave untouched.
  nearMiss: {
    distance: 18,
    points: 2,
    cooldownMs: 1500, // per drone, so hovering beside one can't farm points
    popupColor: '#b8f35f',
    popupMs: 700,
    popupRise: 30,
    outlineColor: 0xffffff // drone outline while a near miss is armed
  },
  // Local 2-player mode (M toggles 1P/2P). P1 keeps colors.player; starts are [x, y].
  multiplayer: {
    p2Color: 0xb79cff,
    p1Start: [320, 250],
    p2Start: [480, 250],
    outColor: 0x55607a,
    outAlpha: 0.5,
    hintSeconds: 2.5
  },
  // Shooting: tap or hold `key` to fire (one shot per fireRateMs) in the movement/facing
  // direction. bulletSpeed is px/s; bullets spawn spawnOffset px ahead of the player, at
  // most maxBullets at once. flashMs is the muzzle flash length.
  shooting: { key: 'F', fireRateMs: 250, bulletSpeed: 520, bulletRadius: 4, bulletColor: 0xb8ff3c,
    maxBullets: 8, spawnOffset: 18, flashMs: 90 }
};
