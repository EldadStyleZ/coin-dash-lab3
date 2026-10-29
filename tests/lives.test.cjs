const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../features/lives.js'), 'utf8');
function load(document) {
  const sandbox = { window: {}, document };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.CoinDashLives;
}
const { LifeState } = load();

test('life counts use safe defaults and clamp to a playable range', () => {
  assert.equal(new LifeState().remaining, 3);
  for (const value of [undefined, null, '', NaN, Infinity, 'invalid']) {
    assert.equal(new LifeState({ maxLives: value }).remaining, 3);
  }
  assert.equal(new LifeState({ maxLives: 0 }).remaining, 1);
  assert.equal(new LifeState({ maxLives: -4 }).remaining, 1);
  assert.equal(new LifeState({ maxLives: 100 }).remaining, 9);
  assert.equal(new LifeState({ maxLives: '5' }).remaining, 5);
  assert.equal(new LifeState({ maxLives: 3.8 }).remaining, 3);
});

test('first collision at round time zero damages once, then expires exactly on the boundary', () => {
  const state = new LifeState({ maxLives: 3, invulnerabilityMs: 1500 });
  assert.equal(state.hit(0).damaged, true);
  assert.equal(state.remaining, 2);
  for (const time of [0, 1, 16, 1499]) {
    assert.equal(state.hit(time).damaged, false);
    assert.equal(state.remaining, 2);
  }
  assert.equal(state.hit(1500).damaged, true);
  assert.equal(state.remaining, 1);
});

test('paused round clock does not consume hit immunity', () => {
  const state = new LifeState();
  state.hit(2000);
  for (let i = 0; i < 100; i++) assert.equal(state.hit(2016).damaged, false);
  assert.equal(state.hit(3499).damaged, false);
  assert.equal(state.hit(3500).damaged, true);
});

test('the last life ends the round and later collisions never subtract or resurrect lives', () => {
  const state = new LifeState({ maxLives: 1 });
  const first = state.hit(10);
  assert.equal(first.damaged, true);
  assert.equal(first.dead, true);
  assert.equal(first.remaining, 0);
  for (const time of [10, 1510, 100000]) {
    const result = state.hit(time);
    assert.equal(result.damaged, false);
    assert.equal(result.dead, true);
    assert.equal(result.remaining, 0);
  }
  assert.equal(state.isInvulnerable(11), false);
});

test('invalid collision timestamps do not consume a life or poison later hits', () => {
  const state = new LifeState();
  for (const time of [NaN, Infinity, undefined, -1, '100']) {
    assert.equal(state.hit(time).damaged, false);
  }
  assert.equal(state.remaining, 3);
  assert.equal(state.hit(0).damaged, true);
});

test('immunity duration defaults, clamps and can be explicitly disabled', () => {
  assert.equal(new LifeState({ invulnerabilityMs: NaN }).invulnerabilityMs, 1500);
  assert.equal(new LifeState({ invulnerabilityMs: 100000 }).invulnerabilityMs, 10000);
  const state = new LifeState({ invulnerabilityMs: 0 });
  assert.equal(state.hit(0).damaged, true);
  assert.equal(state.hit(0).damaged, true);
});

test('UI updates lives, blinking ends, destroy is inert and a new round is fresh', () => {
  const element = { textContent: '', attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } };
  const api = load({ getElementById(id) { return id === 'lives-status' ? element : null; } });
  const player = { alpha: 0.8, setAlpha(value) { this.alpha = value; } };
  const lives = api.create({ player }, { maxLives: 3, invulnerabilityMs: 1500 });
  assert.equal(element.textContent, '♥♥♥ 3 / 3');
  lives.hit(0);
  assert.equal(element.textContent, '♥♥♡ 2 / 3');
  assert.equal(element.attributes['aria-label'], '2 of 3 lives remaining');
  assert.ok(player.alpha < 0.8);
  lives.update(1500);
  assert.equal(player.alpha, 0.8);
  lives.hit(1500);
  lives.update(1600);
  assert.ok(player.alpha < 0.8);
  lives.destroy();
  lives.destroy();
  assert.equal(player.alpha, 0.8);
  assert.equal(lives.hit(5000).damaged, false);
  lives.update(5000);
  assert.equal(lives.remaining, 1);
  const restarted = api.create({ player }, { maxLives: 5 });
  assert.equal(restarted.remaining, 5);
  assert.equal(element.textContent, '♥♥♥♥♥ 5 / 5');
  assert.equal(restarted.hit(0).damaged, true);
});

test('headless usage does not require DOM, storage, player, or timers', () => {
  const lives = load().create({}, { maxLives: 2 });
  assert.equal(lives.hit(0).remaining, 1);
  lives.update(100);
  lives.destroy();
});
