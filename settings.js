// Per-round tuning; partner enemy and combat behavior lives in feature modules.
window.COIN_DASH = {
  width: 800, height: 500, roundSeconds: 60, coinBonusSeconds: 3,
  playerSpeed: 240, droneSpeed: 90, droneCount: 3,
  maxDrones: 20, maxStartingDrones: 12,
  playerCount: 1, difficulty: 'normal',
  startingLives: 3, invulnerabilityMs: 1500,
  levelSeconds: 10, speedStep: 0.14, maxSpeedMultiplier: 2.2,
  colors: { background: 0x101c31, player: 0x71e8ce, coin: 0xffd166, drone: 0xff657a }
};
