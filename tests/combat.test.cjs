const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../features/combat.js'), 'utf8');
function setup() {
  const document = { activeElement: null };
  const window = { document, matchMedia: () => ({ matches: false }) };
  vm.runInNewContext(source, { window });
  const handlers = new Map(), awards = [], sounds = [], spawned = [], colliders = [], objects = [];
  const keyboard = { on(name, fn) { handlers.set(name, fn); }, off(name, fn) { if (handlers.get(name) === fn) handlers.delete(name); } };
  const enemies = [];
  const scene = { runTime: 0, config: { maxDrones: 20 }, input: { keyboard },
    drones: { getChildren: () => enemies, getLength: () => enemies.length },
    arena: { obstacles: {} }, isSpawnClear: () => true,
    awardPoints(...args) { awards.push(args); }, audio: { play(action) { sounds.push(action); } },
    spawnDrone(index, type) { spawned.push([index, type]); const enemy = makeEnemy(type, index); enemies.push(enemy); return enemy; }
  };
  function makeShape(x, y) {
    const object = { x, y, scene, active: true, width: 24, height: 24,
      setOrigin() { return this; }, setDepth() { return this; }, setAlpha(alpha) { this.alpha = alpha; return this; },
      destroy() { this.active = false; this.scene = null; this.body = null; if (this.group) this.group.children = this.group.children.filter(child => child !== this); }
    };
    objects.push(object);
    return object;
  }
  function makeEnemy(type = 'chaser', index = 0) {
    const enemy = makeShape(400, 200);
    const data = new Map([['type', type], ['index', index]]);
    enemy.getData = key => data.get(key);
    enemy.body = { enable: true };
    const destroy = enemy.destroy;
    enemy.destroy = () => { destroy.call(enemy); const at = enemies.indexOf(enemy); if (at >= 0) enemies.splice(at, 1); };
    return enemy;
  }
  const runner = id => ({ id, player: { active: true, x: 400, y: 250, width: 24, height: 24, body: { velocity: { x: 0, y: 0 } } }, abilities: { lastDirection: { x: 1, y: 0 }, dashEndsAt: 0 } });
  const runners = [runner('p1'), runner('p2')];
  scene.getRunners = () => runners.filter(item => item.player.active);
  scene.add = { circle: makeShape, rectangle: makeShape, text: makeShape };
  scene.physics = { add: {
    group() { return { scene, children: [], add(object) {
      this.children.push(object); object.group = this;
      object.body = { velocity: { x: 0, y: 0 }, setCircle() {}, setVelocity(x, y) { this.velocity = { x, y }; } };
    }, destroy() { this.destroyed = true; this.scene = null; [...this.children].forEach(child => child.destroy()); } }; },
    overlap(first, second, callback) { const c = { world: {}, callback, destroy() { this.world = null; } }; colliders.push(c); return c; },
    collider(first, second, callback) { const c = { world: {}, callback, destroy() { this.world = null; } }; colliders.push(c); return c; }
  } };
  const combat = new window.CoinDashCombat(scene);
  const tick = time => { scene.runTime = time; combat.update(time, 16); };
  const key = (name, extra = {}) => handlers.get(name)?.({ repeat: false, target: { tagName: 'DIV' }, ...extra });
  return { combat, scene, runners, enemies, makeEnemy, awards, sounds, spawned, colliders, objects, handlers, document, tick, key };
}

test('F and L fire for the correct runner, keep queued taps and enforce cooldown', () => {
  const h = setup();
  h.key('keydown-F'); h.key('keyup-F'); h.tick(0);
  assert.equal(h.combat.shots.size, 1);
  assert.equal([...h.combat.shots.values()][0].runnerId, 'p1');
  h.key('keydown-F'); h.key('keyup-F'); h.tick(249);
  assert.equal(h.combat.shots.size, 1);
  h.tick(250);
  assert.equal(h.combat.shots.size, 2);
  h.runners[1].abilities.lastDirection = { x: 0, y: -1 };
  h.key('keydown-L'); h.key('keyup-L'); h.tick(251);
  const bullet = [...h.combat.shots.keys()].at(-1);
  assert.equal(h.combat.shots.get(bullet).runnerId, 'p2');
  assert.equal(bullet.body.velocity.y, -520);
});

test('holding fires at the limit but native fields, pause and repeated keys cannot rearm it', () => {
  const h = setup();
  h.key('keydown-F'); h.tick(0); h.tick(250);
  assert.equal(h.combat.shots.size, 2);
  h.combat.setPaused(true);
  h.key('keydown-F', { repeat: true });
  h.combat.setPaused(false);
  h.tick(500);
  assert.equal(h.combat.shots.size, 2);
  h.key('keydown-F', { repeat: true }); h.tick(750);
  assert.equal(h.combat.shots.size, 2);
  h.document.activeElement = { tagName: 'INPUT' };
  h.key('keydown-F'); h.tick(1000);
  assert.equal(h.combat.shots.size, 2);
  h.document.activeElement = null;
  h.key('keydown-F'); h.tick(1001);
  assert.equal(h.combat.shots.size, 3);
});

test('shooting respects active runner, blocked spawn, bullet cap, walls and expiry', () => {
  const h = setup();
  h.scene.isSpawnClear = () => false;
  assert.equal(h.combat.fire(), false);
  h.scene.isSpawnClear = () => true;
  h.runners[1].player.active = false;
  assert.equal(h.combat.fire('p2'), false);
  h.runners[1].player.active = true;
  for (let i = 0; i < 4; i++) { h.scene.runTime = i * 250; h.combat.fire('p1'); h.combat.fire('p2'); }
  h.scene.runTime = 1000;
  assert.equal(h.combat.shots.size, 8);
  assert.equal(h.combat.fire(), false);
  const bullet = [...h.combat.shots.keys()][0];
  h.colliders[1].callback(bullet);
  assert.equal(h.combat.shots.size, 7);
  h.tick(3000);
  assert.equal(h.combat.shots.size, 0);
});

test('dash kills award Hila points once and preserve active-time respawn delay', () => {
  const h = setup();
  h.runners[0].abilities.dashEndsAt = 180;
  const enemy = h.makeEnemy('zipper', 2); h.enemies.push(enemy);
  assert.equal(h.combat.contact(enemy, h.runners[0]), true);
  assert.equal(h.combat.contact(enemy, h.runners[0]), false);
  assert.deepEqual(h.awards, [[10, 'enemy-zipper', 'p1']]);
  assert.ok(h.sounds.includes('slice'));
  h.combat.setPaused(true); h.tick(3000);
  assert.equal(h.spawned.length, 0);
  h.combat.setPaused(false); h.tick(2999);
  assert.equal(h.spawned.length, 0);
  h.tick(3000);
  assert.deepEqual(h.spawned, [[2, 'zipper']]);
});

test('non-dashing contact and inactive runners do not kill or award', () => {
  const h = setup();
  const enemy = h.makeEnemy('chaser'); h.enemies.push(enemy);
  assert.equal(h.combat.contact(enemy, h.runners[0]), false);
  h.runners[0].abilities.dashEndsAt = 100;
  h.scene.runTime = 100;
  assert.equal(h.combat.contact(enemy, h.runners[0]), false);
  h.scene.runTime = 0;
  h.runners[0].player.active = false;
  assert.equal(h.combat.contact(enemy, h.runners[0]), false);
  assert.equal(h.awards.length, 0);
});

test('bullet overlap shares the kill path and awards only its owner', () => {
  const h = setup();
  const enemy = h.makeEnemy('patroller'); h.enemies.push(enemy);
  h.combat.fire('p2');
  const bullet = [...h.combat.shots.keys()][0];
  h.colliders[0].callback(bullet, enemy);
  h.colliders[0].callback(bullet, enemy);
  assert.deepEqual(h.awards, [[3, 'shot-patroller', 'p2']]);
  assert.equal(h.combat.shots.size, 0);
  assert.equal(h.combat.respawns.length, 1);
});

test('respawn waits for a free cap slot and finishing cancels pending respawns and effects', () => {
  const h = setup();
  h.scene.config.maxDrones = 1;
  const first = h.makeEnemy('chaser'); h.enemies.push(first);
  h.combat.kill(first, 'p1', 'shot');
  const blocker = h.makeEnemy('patroller'); h.enemies.push(blocker);
  h.tick(3000);
  assert.equal(h.spawned.length, 0);
  blocker.destroy();
  h.tick(3001);
  assert.equal(h.spawned.length, 1);
  h.combat.kill(h.enemies[0], 'p1', 'shot');
  h.combat.fire();
  h.combat.finish();
  h.tick(10000);
  assert.equal(h.spawned.length, 1);
  assert.equal(h.combat.shots.size, 0);
  assert.equal(h.combat.effects.length, 0);
  assert.equal(h.combat.fire(), false);
});

test('samurai trail and kill effects freeze on pause and clean up on destroy', () => {
  const h = setup();
  h.runners[0].abilities.dashEndsAt = 180;
  h.tick(0);
  assert.equal(h.combat.effects.length, 1);
  const ghost = h.combat.effects[0].object;
  h.combat.setPaused(true); h.tick(1000);
  assert.equal(ghost.active, true);
  h.combat.setPaused(false); h.tick(180);
  assert.equal(ghost.active, false);
  h.combat.fire();
  h.combat.destroy(); h.combat.destroy();
  assert.equal(h.handlers.size, 0);
  assert.equal(h.combat.effects.length, 0);
  assert.ok(h.colliders.every(c => c.world === null));
  assert.equal(h.combat.bullets.destroyed, true);
});
