const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../features/rage.js'), 'utf8');

function enemy(x = 0, y = 0, vx = 60, vy = 80) {
  const data = new Map();
  const object = {
    x, y, active: true, tintFill: false, isTinted: false,
    tintTopLeft: 0xffffff, tintTopRight: 0xffffff, tintBottomLeft: 0xffffff, tintBottomRight: 0xffffff,
    data: { has: key => data.has(key), remove: key => data.delete(key) },
    getData: key => data.get(key), setData(key, value) { data.set(key, value); },
    setTint(tl, tr = tl, bl = tl, br = tl) {
      [this.tintTopLeft, this.tintTopRight, this.tintBottomLeft, this.tintBottomRight] = [tl, tr, bl, br];
      this.isTinted = [tl, tr, bl, br].some(color => color !== 0xffffff);
      this.tintFill = false;
    },
    setTintFill(...colors) { this.setTint(...colors); this.tintFill = true; },
    clearTint() { this.setTint(0xffffff); },
    body: { enable: true, velocity: { x: vx, y: vy }, setVelocity(x, y) { this.velocity = { x, y }; } }
  };
  return object;
}

function setup(members = [enemy(), enemy(50, 80)]) {
  const status = { textContent: '' };
  const window = { document: { getElementById: () => status } };
  vm.runInNewContext(source, { window });
  const sounds = [];
  const scene = { config: { droneSpeed: 90 }, player: { x: 300, y: 400 },
    drones: { getChildren: () => members }, audio: { play: sound => sounds.push(sound) }, paused: false, finished: false };
  const rage = new window.CoinDashRage(scene);
  return { rage, scene, members, sounds, status };
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8);

test('first rage starts at 8s on exactly one red enemy and sound does not repeat each frame', () => {
  const { rage, members, sounds, status } = setup();
  rage.update(7999, 16);
  assert.equal(rage.target, null);
  rage.update(8000, 1);
  assert.equal(rage.target, members[0]);
  assert.equal(members.filter(item => item.getData('enraged')).length, 1);
  assert.equal(members[0].tintTopLeft, 0xff3030);
  assert.equal(members[1].tintTopLeft, 0xffffff);
  assert.match(status.textContent, /ANGRY ENEMY — run!/);
  rage.update(8016, 16);
  rage.update(8032, 16);
  assert.deepEqual(sounds, ['angry']);
});

test('chase aims at the current player, scales normal speed by 1.4, and stays bounded', () => {
  const { rage, members, scene } = setup();
  rage.update(8000, 16);
  near(members[0].body.velocity.x, 84);
  near(members[0].body.velocity.y, 112);
  scene.player = { x: -100, y: 0 };
  rage.update(8016, 16);
  near(members[0].body.velocity.x, -140);
  near(members[0].body.velocity.y, 0);
  const fast = setup([enemy(0, 0, 500, 0)]);
  fast.rage.update(8000, 16);
  near(Math.hypot(fast.members[0].body.velocity.x, fast.members[0].body.velocity.y), 360);
});

test('deadline restores corner tints, fill, metadata and direction then core level speed', () => {
  const original = enemy();
  original.setTintFill(0x112233, 0x445566, 0x778899, 0xaabbcc);
  original.setData('enraged', false);
  original.setData('type', 'partner-type');
  const { rage, scene } = setup([original]);
  let restored = 0;
  scene.setEnemySpeed = item => {
    restored++;
    near(item.body.velocity.x, 60);
    near(item.body.velocity.y, 80);
    item.body.setVelocity(120, 160);
  };
  rage.update(8000, 16);
  rage.update(11999, 16);
  assert.equal(original.getData('enraged'), true);
  rage.update(12000, 1);
  assert.equal(rage.target, null);
  assert.deepEqual([original.tintTopLeft, original.tintTopRight, original.tintBottomLeft, original.tintBottomRight],
    [0x112233, 0x445566, 0x778899, 0xaabbcc]);
  assert.equal(original.tintFill, true);
  assert.equal(original.getData('enraged'), false);
  assert.equal(original.getData('type'), 'partner-type');
  assert.equal(restored, 1);
  assert.deepEqual(original.body.velocity, { x: 120, y: 160 });
});

test('pause freezes active deadlines and does not change chase direction until resumed', () => {
  const { rage, scene, members } = setup();
  rage.update(8000, 16);
  const before = { ...members[0].body.velocity };
  scene.paused = true;
  scene.player.x = -500;
  rage.update(20000, 12000);
  assert.deepEqual(members[0].body.velocity, before);
  assert.equal(rage.time, 8000);
  scene.paused = false;
  rage.update(8100, 100);
  assert.ok(members[0].body.velocity.x < 0);
  assert.equal(members[0].getData('enraged'), true);
});

test('each cycle chooses one enemy and no catch-up cycle repeats in the same frame', () => {
  const { rage, sounds, members } = setup();
  rage.update(8000, 16);
  rage.update(12000, 16);
  rage.update(19999, 16);
  assert.equal(sounds.length, 1);
  rage.update(20000, 1);
  assert.equal(rage.target, members[1]);
  assert.equal(sounds.length, 2);
  rage.update(100000, 80000);
  assert.equal(sounds.length, 3);
  rage.update(100000, 0);
  assert.equal(sounds.length, 3);
  assert.equal(members.filter(item => item.getData('enraged')).length, 1);
});

test('removed living targets restore safely; destroyed targets and empty groups do not throw', () => {
  const { rage, members, sounds } = setup();
  rage.update(8000, 16);
  const removed = members.shift();
  rage.update(8016, 16);
  assert.equal(removed.data.has('enraged'), false);
  assert.deepEqual(removed.body.velocity, { x: 60, y: 80 });
  assert.equal(rage.target, null);
  rage.update(20000, 16);
  members[0].active = false;
  members[0].body = null;
  assert.doesNotThrow(() => rage.update(20016, 16));
  members.length = 0;
  assert.doesNotThrow(() => rage.update(32000, 16));
  assert.equal(sounds.length, 2);
});

test('finish and destroy restore the target, never start new rage, and preserve base AI state', () => {
  const { rage, scene, members, sounds, status } = setup();
  members[0].setData('type', 'hila-chaser');
  members[0].setData('speedMultiplier', 1.2);
  rage.update(8000, 16);
  scene.finished = true;
  rage.update(8016, 16);
  assert.equal(members[0].data.has('enraged'), false);
  assert.equal(members[0].getData('type'), 'hila-chaser');
  assert.equal(members[0].getData('speedMultiplier'), 1.2);
  assert.deepEqual(members[0].body.velocity, { x: 60, y: 80 });
  rage.destroy();
  rage.destroy();
  scene.finished = false;
  rage.update(50000, 16);
  assert.equal(sounds.length, 1);
  assert.equal(status.textContent, '');
});

test('an inactive pooled enemy is restored before it can be reused', () => {
  const { rage, members } = setup();
  rage.update(8000, 16);
  members[0].active = false;
  rage.update(8016, 16);
  assert.equal(members[0].data.has('enraged'), false);
  assert.equal(members[0].tintTopLeft, 0xffffff);
  assert.deepEqual(members[0].body.velocity, { x: 60, y: 80 });
  assert.equal(rage.target, null);
});

test('optional disabled flag, invalid time and enemies already owned by another rage are ignored', () => {
  const { rage, scene, members, sounds } = setup();
  scene.config.rageEnabled = false;
  rage.update(8000, 16);
  assert.equal(sounds.length, 0);
  scene.config.rageEnabled = true;
  members.forEach(item => item.setData('enraged', true));
  for (const time of [NaN, Infinity, -1]) rage.update(time, 16);
  rage.update(8000, 16);
  assert.equal(rage.target, null);
  assert.equal(sounds.length, 0);
});
