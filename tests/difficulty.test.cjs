const test = require('node:test');
const assert = require('node:assert/strict');
const { apply } = require('../features/difficulty.js');
const base = { droneSpeed: 100, droneCount: 3, roundSeconds: 60, startingLives: 5, maxDrones: 20 };
test('Hila presets scale speed, rounded enemy count and round duration', () => {
  const easy = apply(base, 'easy'), hard = apply(base, 'hard');
  assert.deepEqual([easy.droneSpeed, easy.droneCount, easy.roundSeconds], [75, 2, 80]);
  assert.deepEqual([hard.droneSpeed, hard.droneCount, hard.roundSeconds], [130, 5, 48]);
  assert.equal(easy.startingLives, 5);
  assert.equal(hard.difficultyId, 'hard');
});
test('normal and invalid selections retain normal tuning without mutating base', () => {
  const copy = structuredClone(base);
  assert.equal(apply(base, 'unknown').difficulty, 'normal');
  assert.equal(apply(base, 'Easy').difficulty, 'easy');
  assert.equal(apply(base, '__proto__').droneCount, 3);
  assert.equal(apply(base, 'normal').roundSeconds, 60);
  assert.deepEqual(base, copy);
});
test('effective settings clamp to caps and recover from non-finite input', () => {
  const capped = apply({ droneCount: 100, maxDrones: 20, droneSpeed: 900, maxDroneSpeed: 200, roundSeconds: 1000 }, 'hard');
  assert.deepEqual([capped.droneCount, capped.droneSpeed, capped.roundSeconds], [20, 200, 300]);
  const bad = apply({ droneCount: NaN, droneSpeed: Infinity, roundSeconds: -1 }, 'normal');
  assert.deepEqual([bad.droneCount, bad.droneSpeed, bad.roundSeconds], [3, 90, 10]);
});
