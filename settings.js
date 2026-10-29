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
  // Close-call bonus: get within `distance` px (edge to edge) of a drone, then leave untouched.
  nearMiss: {
    distance: 18,
    points: 2,
    cooldownMs: 1500, // per drone, so hovering beside one can't farm points
    popupColor: '#b8f35f',
    popupMs: 700,
    popupRise: 30,
    outlineColor: 0xffffff // drone outline while a near miss is armed
  }
};
