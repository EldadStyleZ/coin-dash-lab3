const test = require('node:test');
const assert = require('node:assert/strict');
const CoinDashNearMiss = require('../features/near-miss.js');
function sprite(x) { return { active: true, body: { enable: true, left: x, right: x + 20, top: 0, bottom: 20 } }; }
function move(sprite, x) { sprite.body.left = x; sprite.body.right = x + 20; }
function setup(twoPlayers = false) {
  const player = sprite(0), enemy = sprite(30), awards = [];
  const runners = [{ id: 'p1', player }];
  if (twoPlayers) runners.push({ id: 'p2', player: sprite(0) });
  const scene = { player, getRunners: () => runners, drones: { getChildren: () => [enemy] },
    awardPoints: (...args) => awards.push(args) };
  return { player, enemy, awards, runners, scene, near: new CoinDashNearMiss(scene) };
}
test('approach then leave awards score only and respects per-enemy 1500ms cooldown', () => {
  const { near, enemy, awards } = setup();
  near.update(0); move(enemy, 50); near.update(100);
  assert.deepEqual(awards, [[2, 'near-miss', 'p1']]);
  move(enemy, 30); near.update(200); move(enemy, 50); near.update(300);
  assert.equal(awards.length, 1);
  move(enemy, 30); near.update(1600); move(enemy, 50); near.update(1700);
  assert.equal(awards.length, 2);
});
test('touching edges or explicit contact invalidates a pass even if protected', () => {
  for (const explicit of [false, true]) {
    const { near, enemy, awards } = setup();
    near.update(0);
    if (explicit) near.contact('p1', enemy); else { move(enemy, 20); near.update(10); }
    move(enemy, 50); near.update(20);
    assert.equal(awards.length, 0);
  }
});
test('disabled or killed enemies never pay and no visual tint is modified', () => {
  for (const disable of [enemy => { enemy.body.enable = false; }, enemy => { enemy.active = false; }, enemy => { enemy.killed = true; }]) {
    const { near, enemy, awards } = setup();
    enemy.setTint = () => assert.fail('near misses must not override rage visuals');
    near.update(0); disable(enemy); move(enemy, 50); near.update(20);
    assert.equal(awards.length, 0);
  }
});
test('two players have independent pass state and contact invalidates only its runner', () => {
  const { near, enemy, awards } = setup(true);
  near.update(0); near.contact('p1', enemy); move(enemy, 50); near.update(20);
  assert.deepEqual(awards, [[2, 'near-miss', 'p2']]);
});
test('dead runners are excluded and pause/destroy produce no rewards', () => {
  const { near, enemy, awards, runners, scene } = setup(true);
  near.update(0); runners[1].player.active = false;
  scene.paused = true; move(enemy, 50); near.update(50);
  assert.equal(awards.length, 0);
  scene.paused = false; near.update(60);
  assert.deepEqual(awards, [[2, 'near-miss', 'p1']]);
  near.destroy(); move(enemy, 30); near.update(2000); move(enemy, 50); near.update(2100);
  assert.equal(awards.length, 1);
});
test('body gap uses actual edges and supports legacy single-player scenes', () => {
  const { scene, near, enemy, awards } = setup();
  delete scene.getRunners;
  assert.equal(CoinDashNearMiss.bodyGap(scene.player.body, enemy.body), 10);
  near.update(0); move(enemy, 50); near.update(20);
  assert.deepEqual(awards, [[2, 'near-miss', 'p1']]);
});
test('removed enemies discard armed passes before a pooled object is reused', () => {
  const { scene, near, enemy, awards } = setup();
  near.update(0);
  scene.drones.getChildren = () => [];
  near.update(10);
  move(enemy, 50);
  scene.drones.getChildren = () => [enemy];
  near.update(20);
  assert.equal(awards.length, 0);
});
