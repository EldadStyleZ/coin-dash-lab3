/* Hila's difficulty presets (8a0f470), adapted to the shared per-round config. */
(function (root) {
  'use strict';
  const presets = Object.freeze({
    easy: Object.freeze({ droneSpeed: 0.75, droneCount: 0.67, roundSeconds: 1.34 }),
    normal: Object.freeze({ droneSpeed: 1, droneCount: 1, roundSeconds: 1 }),
    hard: Object.freeze({ droneSpeed: 1.3, droneCount: 1.67, roundSeconds: 0.8 })
  });
  const finite = (value, fallback) => Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : fallback;
  const clamp = (number, low, high) => Math.max(low, Math.min(high, number));
  function apply(baseConfig = {}, id = 'normal') {
    const requested = String(id).toLowerCase();
    const difficulty = Object.hasOwn(presets, requested) ? requested : 'normal';
    const tuning = presets[difficulty];
    const maxDrones = clamp(Math.round(finite(baseConfig.maxDrones, 20)), 1, 100);
    const maxDroneSpeed = clamp(finite(baseConfig.maxDroneSpeed, 600), 20, 2000);
    const maxRoundSeconds = clamp(finite(baseConfig.maxRoundSeconds, 300), 10, 3600);
    return {
      ...baseConfig,
      difficulty, difficultyId: difficulty,
      droneCount: clamp(Math.round(finite(baseConfig.droneCount, 3) * tuning.droneCount), 1, maxDrones),
      droneSpeed: clamp(finite(baseConfig.droneSpeed, 90) * tuning.droneSpeed, 20, maxDroneSpeed),
      roundSeconds: clamp(Math.round(finite(baseConfig.roundSeconds, 60) * tuning.roundSeconds), 10, maxRoundSeconds)
    };
  }
  root.CoinDashDifficulty = { apply, presets };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CoinDashDifficulty;
}(typeof window !== 'undefined' ? window : globalThis));
