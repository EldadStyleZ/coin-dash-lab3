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
test('strike has no forced motion, speed boost, or direction lock', () => {
  const { ability } = setup();
  ability.velocity(0, -1, 0);
  ability.strike(0);
  assert.equal(ability.strikeDirection.y, -1);
  assert.equal(Math.hypot(...Object.values(ability.velocity(0, 0, 20))), 0);
  const next = ability.velocity(1, 1, 30);
  assert.ok(Math.abs(Math.hypot(next.x, next.y) - 240) < 1e-9);
  assert.ok(next.x > 0 && next.y > 0);
});
test('miss cooldown lasts exactly one active second from strike start', () => {
  const { ability, status } = setup();
  assert.equal(ability.strike(0), true);
  assert.equal(ability.strikeEndsAt, 160);
  assert.equal(status.textContent, 'Striking!');
  assert.equal(ability.strike(160), false);
  assert.equal(ability.strike(999), false);
  assert.equal(ability.strike(1000), true);
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
  assert.equal(ability.resetStrike(2, 160), false);
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
test('destroy removes both keyboard aliases and makes the controller inert', () => {
  const { ability, scene } = setup();
  ability.destroy(); ability.destroy();
  assert.equal(scene.input.keyboard.listenerCount('keydown-SHIFT'), 0);
  assert.equal(scene.input.keyboard.listenerCount('keydown-SPACE'), 0);
  assert.equal(ability.strike(10000), false);
  assert.equal(ability.resetStrike(0, 0), false);
});
