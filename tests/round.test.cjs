const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../features/round.js');
const config = { roundSeconds: 60, levelSeconds: 10, speedStep: 0.14, maxSpeedMultiplier: 2.2 };
test('levels advance at boundaries and difficulty increases', () => {
 const r = new CoinDashRound(config);
 assert.equal(r.advance(9999).gainedLevels, 0);
 assert.equal(r.advance(1).gainedLevels, 1);
 assert.equal(r.level, 2); assert.ok(Math.abs(r.speedMultiplier - 1.14) < 1e-10);
 assert.equal(r.advance(20000).gainedLevels, 2); assert.equal(r.level, 4);
});
test('pause freezes level, countdown and elapsed active time', () => {
 const r = new CoinDashRound(config); r.advance(8000); r.setPaused(true);
 r.advance(30000); assert.equal(r.elapsed, 8000); assert.equal(r.secondsRemaining, 52);
 r.setPaused(false); r.advance(2000); assert.equal(r.level, 2);
});
test('round completion caps time and does not create an extra final level', () => {
 const r = new CoinDashRound(config); r.advance(80000);
 assert.equal(r.elapsed, 60000); assert.equal(r.finished, true); assert.equal(r.level, 6);
 assert.equal(r.secondsRemaining, 0); assert.equal(r.advance(10000).gainedLevels, 0);
});
test('speed is bounded and invalid frame deltas cannot corrupt state', () => {
 const r = new CoinDashRound({ ...config, speedStep: 5 });
 r.advance(10000); assert.equal(r.speedMultiplier, 2.2);
 for (const delta of [-1, NaN, Infinity, undefined]) r.advance(delta);
 assert.equal(r.elapsed, 10000);
});
test('manual finish stops clock, new instance resets, invalid config rejected', () => {
 const r = new CoinDashRound(config); r.advance(123); r.finish(); r.advance(10000);
 assert.equal(r.elapsed, 123); assert.equal(new CoinDashRound(config).elapsed, 0);
 assert.throws(() => new CoinDashRound({ ...config, levelSeconds: 0 }), RangeError);
});
