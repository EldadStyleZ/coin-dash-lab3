const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../features/enemies.js'), 'utf8');
function setup(type = 'drone', index = 0) {
  const window = {};
  vm.runInNewContext(source, { window });
  const data = new Map([['type', type]]);
  const enemy = { active: true, x: 400, y: 250, width: 24, height: 24, rotation: 0,
    getData: key => data.get(key), setData(key, value) { data.set(key, value); }, setTint(color) { this.tint = color; },
    body: { velocity: { x: 1, y: 1 }, setVelocity(x, y) { this.velocity = { x, y }; } } };
  const runners = [{ id: 'p1', player: { x: 700, y: 250 } }, { id: 'p2', player: { x: 400, y: 200 } }];
  const scene = { config: { droneSpeed: 100 }, round: { speedMultiplier: 1 },
    drones: { getChildren: () => [enemy] }, getRunners: () => runners };
  const api = window.CoinDashEnemies;
  api.decorate(scene, enemy, index, 1);
  return { api, enemy, scene, runners };
}
test('cyclic types retain Hila multipliers, points and distinct tint', () => {
  const types = ['chaser', 'patroller', 'zipper'];
  const tints = [];
  for (let i = 0; i < 3; i++) {
    const h = setup('drone', i);
    assert.equal(h.enemy.getData('type'), types[i]);
    assert.equal(h.enemy.getData('speedMultiplier'), [0.6, 1.2, 2][i]);
    assert.equal(h.enemy.getData('killPoints'), [5, 3, 10][i]);
    tints.push(h.enemy.tint);
  }
  assert.equal(new Set(tints).size, 3);
  assert.equal(setup('zipper', 0).enemy.getData('type'), 'zipper');
});
test('chaser tracks nearest active player and handles zero distance', () => {
  const h = setup('chaser');
  h.api.update(h.scene, 16);
  assert.equal(h.enemy.body.velocity.x, 0);
  assert.equal(h.enemy.body.velocity.y, -60);
  h.runners[1].player.active = false;
  h.api.update(h.scene, 16);
  assert.equal(h.enemy.body.velocity.x, 60);
  h.runners[0].player.x = 400;
  h.api.update(h.scene, 16);
  assert.deepEqual(h.enemy.body.velocity, { x: 0, y: 0 });
});
test('patroller reverses at line ends and retains wall-bounce direction', () => {
  const h = setup('patroller', 0);
  h.enemy.x = h.enemy.getData('max');
  h.api.update(h.scene, 16);
  assert.deepEqual(h.enemy.body.velocity, { x: -120, y: 0 });
  h.enemy.x = 400;
  h.api.update(h.scene, 16);
  assert.equal(h.enemy.body.velocity.x, -120);
  h.enemy.x = h.enemy.getData('min');
  h.api.update(h.scene, 16);
  assert.equal(h.enemy.body.velocity.x, 120);
});
test('zipper preserves reflected direction and uses current level speed', () => {
  const h = setup('zipper');
  h.enemy.body.setVelocity(-1, 0);
  h.scene.round.speedMultiplier = 2;
  h.api.levelChanged(h.scene, 5);
  assert.equal(h.enemy.body.velocity.x, -400);
  h.api.update(h.scene, 10);
  assert.equal(h.enemy.rotation, 0.12);
});
test('rage owns marked enemy velocity and pause/death leave all movement unchanged', () => {
  const h = setup('chaser');
  h.enemy.setData('enraged', true);
  h.enemy.body.setVelocity(7, 8);
  h.api.update(h.scene, 16);
  h.api.levelChanged(h.scene, 9);
  assert.deepEqual(h.enemy.body.velocity, { x: 7, y: 8 });
  h.enemy.setData('enraged', false);
  h.scene.paused = true;
  h.api.update(h.scene, 16);
  assert.deepEqual(h.enemy.body.velocity, { x: 7, y: 8 });
  h.scene.paused = false;
  h.enemy.active = false;
  h.api.update(h.scene, 16);
  assert.deepEqual(h.enemy.body.velocity, { x: 7, y: 8 });
});
