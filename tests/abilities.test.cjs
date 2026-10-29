const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { EventEmitter } = require('node:events');
function setup() {
  const status = { textContent: '' };
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../features/abilities.js'), 'utf8'),
    { window, document: { getElementById: () => status } });
  const scene = { config: { playerSpeed: 240 }, runTime: 0, events: new EventEmitter(), input: { keyboard: new EventEmitter() } };
  const ability = new window.CoinDashAbilities(scene);
  return { ability, scene, status };
}
test('sword strike restores the 180ms lunge at 2.5x speed in its starting direction', () => {
  const { ability } = setup();
  ability.velocity(0, -1, 0);
  ability.strike(0);
  assert.equal(ability.strikeDirection.y, -1);
  assert.equal(ability.velocity(0, 0, 20).y, -600);
  const next = ability.velocity(1, 1, 30);
  assert.equal(next.x, 0);
  assert.equal(next.y, -600);
  assert.equal(ability.velocity(0, 0, 179).y, -600);
  assert.equal(Math.hypot(...Object.values(ability.velocity(0, 0, 180))), 0);
  const walking = ability.velocity(1, 1, 181);
  assert.ok(Math.abs(Math.hypot(walking.x, walking.y) - 240) < 1e-9);
});
test('Shift is disabled while Space starts the sword dash', () => {
  const { ability, scene } = setup();
  scene.input.keyboard.emit('keydown-SHIFT', { target: { tagName: 'DIV' } });
  assert.equal(ability.strikeId, 0);
  assert.equal(ability.velocity(1, 0, 0).x, 240);
  scene.input.keyboard.emit('keydown-SPACE', { target: { tagName: 'DIV' } });
  assert.equal(ability.strikeId, 1);
  assert.equal(ability.velocity(0, 0, 0).x, 600);
});
test('miss cooldown lasts 1.8 active seconds from strike start', () => {
  const { ability, status } = setup();
  assert.equal(ability.strike(0), true);
  assert.equal(ability.strikeEndsAt, 180);
  assert.equal(status.textContent, 'Striking!');
  assert.equal(ability.strike(180), false);
  assert.equal(ability.strike(1000), false); // Old recovery point must remain locked.
  assert.equal(ability.strike(1799), false);
  assert.equal(ability.strike(1800), true);
  assert.equal(ability.strikeId, 2);
});
test('synchronous kill reset survives strike() returning and stale reset cannot unlock newer swing', () => {
  const { ability, scene, status } = setup();
  scene.events.once('player-strike', event => ability.resetStrike(event.strikeId, 0));
  assert.equal(ability.strike(0), true);
  assert.equal(ability.nextStrikeAt, 0);
  assert.match(status.textContent, /Strike ready/);
  assert.equal(ability.strike(0), true);
  assert.equal(ability.strikeId, 2);
  assert.equal(ability.resetStrike(1, 0), false);
  assert.equal(ability.strike(1), false);
  assert.equal(ability.resetStrike(2, 180), false);
});
test('pause, death, disabled, bad timestamps and native form focus block strikes', () => {
  const { ability, scene } = setup();
  for (const time of [undefined, NaN, Infinity, -1]) assert.equal(ability.strike(time), false);
  scene.paused = true; assert.equal(ability.strike(0), false); scene.paused = false;
  scene.finished = true; assert.equal(ability.strike(0), false); scene.finished = false;
  ability.disabled = true; assert.equal(ability.strike(0), false); ability.disabled = false;
  for (const target of [{ tagName: 'INPUT' }, { tagName: 'BUTTON' }, { isContentEditable: true }]) scene.input.keyboard.emit('keydown-SPACE', { target });
  scene.input.keyboard.emit('keydown-SPACE', { target: { tagName: 'DIV' }, repeat: true });
  assert.equal(ability.strikeId, 0);
  scene.input.keyboard.emit('keydown-SPACE', { target: { tagName: 'DIV' } });
  assert.equal(ability.strikeId, 1);
});
test('destroy removes the sword binding and makes the controller inert', () => {
  const { ability, scene } = setup();
  ability.destroy(); ability.destroy();
  assert.equal(scene.input.keyboard.listenerCount('keydown-SHIFT'), 0);
  assert.equal(scene.input.keyboard.listenerCount('keydown-SPACE'), 0);
  assert.equal(ability.strike(10000), false);
  assert.equal(ability.resetStrike(0, 0), false);
});
