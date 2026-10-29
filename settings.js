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
  // Local 2-player mode (M toggles 1P/2P). P1 keeps colors.player; starts are [x, y].
  multiplayer: {
    p2Color: 0xb79cff,
    p1Start: [320, 250],
    p2Start: [480, 250],
    outColor: 0x55607a,
    outAlpha: 0.5,
    hintSeconds: 2.5
  }
};
