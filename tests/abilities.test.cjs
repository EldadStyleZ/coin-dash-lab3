const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const source = fs.readFileSync(path.join(__dirname, '../features/abilities.js'), 'utf8');
function setup(withDom = false) {
  const status = { textContent: '' };
  const sandbox = { window: {} };
  if (withDom) sandbox.document = { getElementById: () => status };
  vm.runInNewContext(source, sandbox);
  const keyboard = new EventEmitter();
  const scene = { config: { playerSpeed: 240 }, input: { keyboard }, runTime: 0, paused: false, finished: false };
  const abilities = new sandbox.window.CoinDashAbilities(scene);
  return { abilities, scene, keyboard, status, Class: sandbox.window.CoinDashAbilities };
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8);

test('normal movement preserves configured speed and normalizes diagonals', () => {
  const { abilities, scene } = setup();
  const diagonal = abilities.velocity(1, 1, 0);
  close(Math.hypot(diagonal.x, diagonal.y), 240);
  assert.equal(abilities.velocity(0, 0, 0).x, 0);
  scene.config.playerSpeed = 300;
  assert.equal(abilities.velocity(-5, 0, 20).x, -300);
});

test('dash starts at time zero, defaults right, and stops exactly at 180ms', () => {
  const { abilities } = setup();
  assert.equal(abilities.dash(0), true);
  assert.equal(abilities.velocity(0, 0, 0).x, 600);
  assert.equal(abilities.velocity(0, 0, 179).x, 600);
  assert.equal(abilities.velocity(0, 0, 180).x, 0);
});

test('stationary dash uses last direction, locks burst direction, and does not boost diagonal speed', () => {
  const { abilities } = setup();
  abilities.velocity(-1, -1, 0);
  abilities.velocity(0, 0, 10);
  abilities.dash(10);
  const burst = abilities.velocity(1, 0, 50);
  assert.ok(burst.x < 0 && burst.y < 0);
  close(Math.hypot(burst.x, burst.y), 600);
  assert.equal(abilities.velocity(1, 0, 190).x, 240);
});

test('cooldown rejects repeated input and unlocks exactly after 1800 active ms', () => {
  const { abilities, scene } = setup(true);
  abilities.dash(0);
  for (const time of [0, 100, 179, 180, 1799]) assert.equal(abilities.dash(time), false);
  abilities.velocity(0, 0, 800);
  assert.match(abilities.status.textContent, /1\.0s/);
  scene.paused = true;
  assert.equal(abilities.dash(800), false);
  assert.equal(abilities.velocity(1, 0, 800).x, 0);
  scene.paused = false;
  assert.equal(abilities.dash(800), false);
  assert.equal(abilities.dash(1800), true);
});

test('Shift ignores form focus, repeated keys, shortcuts, pause, and game over', () => {
  const { abilities, scene, keyboard } = setup();
  for (const event of [
    { repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true },
    { target: { tagName: 'INPUT' } }, { target: { tagName: 'TEXTAREA' } },
    { target: { tagName: 'SELECT' } }, { target: { tagName: 'BUTTON' } },
    { target: { isContentEditable: true } }
  ]) keyboard.emit('keydown-SHIFT', event);
  assert.equal(abilities.nextDashAt, 0);
  scene.paused = true;
  keyboard.emit('keydown-SHIFT', {});
  scene.paused = false;
  scene.finished = true;
  keyboard.emit('keydown-SHIFT', {});
  assert.equal(abilities.nextDashAt, 0);
  scene.finished = false;
  let prevented = false;
  keyboard.emit('keydown-SHIFT', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(abilities.nextDashAt, 1800);
});

test('destroy removes only its own keyboard listener and new rounds start ready', () => {
  const { abilities, keyboard, scene, Class } = setup();
  const unrelated = () => {};
  keyboard.on('keydown-SHIFT', unrelated);
  abilities.dash(0);
  abilities.destroy();
  abilities.destroy();
  assert.equal(keyboard.listenerCount('keydown-SHIFT'), 1);
  assert.equal(abilities.dash(2000), false);
  assert.equal(abilities.velocity(1, 0, 2000).x, 0);
  const restarted = new Class(scene);
  assert.equal(restarted.dash(0), true);
  restarted.destroy();
  assert.equal(keyboard.listenerCount('keydown-SHIFT'), 1);
});

test('invalid input is safe and no DOM or Phaser dependency is required', () => {
  const { abilities, scene, Class } = setup();
  for (const time of [NaN, Infinity, -1, undefined]) assert.equal(abilities.dash(time), false);
  assert.equal(abilities.velocity(NaN, Infinity, 0).x, 0);
  assert.equal(abilities.velocity(1, 0, NaN).x, 0);
  scene.config.playerSpeed = NaN;
  assert.equal(abilities.velocity(1, 0, 0).x, 240);
  const bare = new Class({ config: { playerSpeed: 100 } });
  assert.equal(bare.velocity(0, 2, 0).y, 100);
  bare.destroy();
});

test('Space shares P1 slice cooldown while Enter activates only P2', () => {
  const { abilities, scene, keyboard, Class } = setup();
  const second = new Class(scene, { keys: ['ENTER'], label: 'Enter', runnerId: 'p2' });
  keyboard.emit('keydown-SPACE', {});
  assert.equal(abilities.nextDashAt, 1800);
  assert.equal(second.nextDashAt, 0);
  keyboard.emit('keydown-ENTER', {});
  assert.equal(second.nextDashAt, 1800);
  abilities.disabled = true;
  assert.equal(abilities.dash(2000), false);
  abilities.destroy(); second.destroy();
  assert.equal(keyboard.listenerCount('keydown-SPACE'), 0);
  assert.equal(keyboard.listenerCount('keydown-ENTER'), 0);
});
