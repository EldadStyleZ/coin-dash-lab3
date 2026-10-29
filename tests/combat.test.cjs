const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(path.join(__dirname, '../features/combat.js'), 'utf8');
function setup(reducedMotion = false) {
  const killStatus = { textContent: '' };
  const document = { activeElement: null, getElementById: id => id === 'kill-status' ? killStatus : null };
  const window = { document, matchMedia: () => ({ matches: reducedMotion }) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../features/abilities.js'), 'utf8'), { window, document });
  vm.runInNewContext(source, { window, document });
  const handlers = new Map(), awards = [], sounds = [], announcements = [], spawned = [], colliders = [], objects = [];
  const keyboard = { on(name, fn) { handlers.set(name, fn); }, off(name, fn) { if (handlers.get(name) === fn) handlers.delete(name); } };
  const enemies = [];
  const scene = { events: new EventEmitter(), runTime: 0, config: { maxDrones: 20 }, input: { keyboard },
    drones: { getChildren: () => enemies, getLength: () => enemies.length },
    arena: { obstacles: {} }, isSpawnClear: () => true,
    reactions: { announce(message) { announcements.push(message); } },
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
  const runner = id => ({ id, player: { active: true, x: 400, y: 250, width: 24, height: 24, body: { velocity: { x: 0, y: 0 } } }, abilities: new window.CoinDashAbilities(scene, { runnerId: id, keys: id === 'p1' ? ['SPACE'] : ['ENTER'] }) });
  const runners = [runner('p1'), runner('p2')];
  scene.getRunners = () => runners.filter(item => item.player.active);
  scene.add = { circle: makeShape, text: makeShape,
    rectangle(x, y, width, height, color, alpha = 1) {
      return Object.assign(makeShape(x, y), { width, height, color, alpha });
    }
  };
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
  return { combat, scene, runners, enemies, makeEnemy, awards, sounds, announcements, killStatus, spawned, colliders, objects, handlers, document, tick, key };
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


function target(h, x = 450, y = 250, type = 'chaser') {
  const enemy = h.makeEnemy(type, h.enemies.length);
  enemy.x = x; enemy.y = y; h.enemies.push(enemy);
  return enemy;
}

test('physics contact during the dash kills and immediately reloads for another dash', () => {
  const h = setup(), ability = h.runners[0].abilities;
  const first = target(h);
  assert.equal(ability.strike(0), true);
  assert.equal(first.active, true);
  assert.equal(ability.nextStrikeAt, 1000);
  assert.equal(h.combat.contact(first, h.runners[0]), true);
  assert.equal(first.active, false);
  assert.equal(ability.nextStrikeAt, 0);
  assert.deepEqual(h.awards, [[5, 'enemy-chaser', 'p1']]);
  const second = target(h, 460, 250, 'zipper');
  assert.equal(ability.strike(0), true);
  assert.equal(second.active, true);
  assert.equal(h.combat.contact(second, h.runners[0]), true);
  assert.equal(second.active, false);
  assert.equal(ability.strikeId, 2);
  assert.deepEqual(h.awards[1], [10, 'enemy-zipper', 'p1']);
  assert.match(h.killStatus.textContent, /P1: 2 kills/);
  assert.match(h.announcements[0], /DOUBLE KILL/);
  assert.equal(Math.hypot(...Object.values(ability.velocity(0, 0, 0))), 600);
  assert.equal(ability.velocity(1, 0, 0).x, 600);
});

test('miss keeps one-second cooldown; whiff and chain reset happen once at swing end', () => {
  const h = setup(), ability = h.runners[0].abilities;
  const first = target(h); ability.strike(0); h.combat.contact(first, h.runners[0]);
  assert.equal(h.combat.killChains.get('p1').count, 1);
  assert.equal(ability.strike(0), true);
  h.tick(179); assert.equal(h.sounds.includes('whiff'), false);
  assert.equal(ability.strike(179), false);
  h.tick(180); h.tick(181);
  assert.equal(h.sounds.filter(sound => sound === 'whiff').length, 1);
  assert.equal(h.combat.killChains.has('p1'), false);
  assert.equal(ability.strike(999), false);
  h.scene.runTime = 1000;
  assert.equal(ability.strike(1000), true);
});

test('sword lunge keeps its trail but must physically reach an enemy before a kill', () => {
  const h = setup(), runner = h.runners[0], ability = runner.abilities;
  const enemy = target(h, 520, 250);
  ability.strike(0);
  const velocity = ability.velocity(0, 0, 80);
  runner.player.x += velocity.x * 0.08;
  h.tick(80);
  assert.equal(enemy.active, true); // 72px away used to be an automatic kill.
  assert.equal(ability.nextStrikeAt, 1000);
  const firstGhost = h.combat.effects.find(effect => effect.start === 0);
  assert.equal(firstGhost.object.x, 400);
  assert.equal(firstGhost.object.y, 250);
  assert.equal(firstGhost.end, 160);
  runner.player.x = 502; // The 24px bodies now overlap.
  h.tick(170);
  assert.equal(enemy.active, true); // Only the physics contact callback may kill.
  assert.equal(h.combat.contact(enemy, runner), true);
  assert.equal(ability.nextStrikeAt, 170);
  assert.equal(ability.strike(170), true);
  h.tick(180);
  assert.equal(h.combat.swings.get('p1').id, 2);
  assert.equal(h.sounds.includes('whiff'), false);
});

test('pressing or updating a dash never automatically kills nearby enemies', () => {
  for (const [x, y] of [[425, 250], [450, 250], [476, 250], [477, 250], [350, 250], [420, 290]]) {
    const h = setup(), enemy = target(h, x, y);
    h.runners[0].abilities.strike(0);
    h.tick(50); h.tick(179);
    assert.equal(enemy.active, true, `nearby target ${x},${y}`);
    assert.equal(h.awards.length, 0);
    assert.equal(h.combat.killChains.size, 0);
    assert.equal(h.runners[0].abilities.nextStrikeAt, 1000);
  }
});

test('wall-separated enemies and large body radii do not grant ranged sword hits', () => {
  const h = setup(), enemy = target(h, 450, 250);
  enemy.body.center = { x: 450, y: 250 };
  enemy.body.halfWidth = 20; enemy.body.halfHeight = 20;
  h.runners[0].player.body.center = { x: 400, y: 250 };
  h.scene.isSpawnClear = (x, y) => !(x >= 420 && x <= 430 && y > 240 && y < 260);
  h.runners[0].abilities.strike(0);
  h.tick(100);
  assert.equal(enemy.active, true);
  assert.equal(h.awards.length, 0);
});

test('original contact rule accepts any touching side, only during the active dash', () => {
  for (const [x, y] of [[390, 250], [410, 250], [400, 240], [400, 260]]) {
    const h = setup(), ability = h.runners[0].abilities;
    const enemy = target(h, x, y);
    assert.equal(h.combat.contact(enemy, h.runners[0]), false);
    ability.strike(0);
    h.tick(100);
    assert.equal(h.combat.contact(enemy, h.runners[0]), true);
    assert.equal(ability.nextStrikeAt, 100);
    const late = target(h, x, y);
    h.tick(180);
    assert.equal(h.combat.contact(late, h.runners[0]), false);
    assert.equal(late.active, true);
  }
});

test('P2 strike reset and kill chains never unlock or reward P1; duplicate events/kills are inert', () => {
  const h = setup(), p1 = h.runners[0], p2 = h.runners[1];
  p1.abilities.lastDirection = { x: -1, y: 0 };
  p1.abilities.strike(0);
  const enemy = target(h, 450, 250, 'patroller');
  p2.abilities.strike(0);
  h.scene.events.emit('player-strike', { runnerId: 'p2', strikeId: 1 });
  assert.equal(h.awards.length, 0);
  assert.equal(h.combat.contact(enemy, p2), true);
  assert.equal(h.combat.contact(enemy, p2), false);
  assert.deepEqual(h.awards, [[3, 'enemy-patroller', 'p2']]);
  assert.equal(p2.abilities.nextStrikeAt, 0);
  assert.equal(p1.abilities.nextStrikeAt, 1000);
  assert.equal(h.combat.killChains.get('p2').count, 1);
});

test('old strike expiry/event cannot reset or whiff a newer successful swing', () => {
  const h = setup(), ability = h.runners[0].abilities;
  const first = target(h); ability.strike(0); h.combat.contact(first, h.runners[0]);
  h.scene.runTime = 100;
  const second = target(h); ability.strike(100); h.combat.contact(second, h.runners[0]);
  h.scene.events.emit('player-strike', { runnerId: 'p1', strikeId: 1 });
  h.tick(180);
  assert.equal(h.combat.swings.get('p1').id, 2);
  assert.equal(h.sounds.includes('whiff'), false);
  assert.equal(ability.nextStrikeAt, 100);
  h.tick(280);
  assert.equal(h.sounds.includes('whiff'), false);
  assert.equal(h.awards.length, 2);
});

test('shot kill immediately reloads only its shooter and never unlocks a sword strike', () => {
  const h = setup(), p1 = h.runners[0], p2 = h.runners[1];
  p1.abilities.strike(0); p2.abilities.strike(0);
  h.combat.fire('p1'); h.combat.fire('p2');
  const bullet = [...h.combat.shots.keys()][0];
  const enemy = target(h, 600, 250, 'zipper');
  h.colliders[0].callback(bullet, enemy);
  h.colliders[0].callback(bullet, enemy);
  assert.equal(h.combat.nextShot.get('p1'), 0);
  assert.equal(h.combat.nextShot.get('p2'), 250);
  assert.equal(h.combat.fire('p1'), true);
  assert.equal(h.combat.fire('p2'), false);
  assert.equal(p1.abilities.nextStrikeAt, 1000);
  assert.equal(p2.abilities.nextStrikeAt, 1000);
  assert.deepEqual(h.awards, [[10, 'shot-zipper', 'p1']]);
  h.tick(180);
  assert.equal(h.combat.killChains.has('p1'), false);
});

test('quick kills combine sword and shots without multiplying points and expire at 2.5s', () => {
  const h = setup();
  const enemy = target(h); h.runners[0].abilities.strike(0); h.combat.contact(enemy, h.runners[0]);
  h.scene.runTime = 200; h.combat.fire();
  h.colliders[0].callback([...h.combat.shots.keys()][0], target(h, 600, 250));
  assert.equal(h.combat.killChains.get('p1').count, 2);
  assert.equal(h.awards.reduce((sum, [points]) => sum + points, 0), 10);
  h.tick(2699); assert.equal(h.combat.killChains.get('p1').count, 2);
  h.tick(2700); assert.equal(h.combat.killChains.has('p1'), false);
});

test('paused active time freezes misses and respawns; cap respected; finish/destroy cancel all work', () => {
  const h = setup();
  h.scene.config.maxDrones = 1;
  const enemy = target(h); h.runners[0].abilities.strike(0); h.combat.contact(enemy, h.runners[0]);
  h.runners[0].abilities.strike(0);
  h.scene.paused = true; h.combat.setPaused(true); h.tick(10000);
  assert.equal(h.sounds.includes('whiff'), false);
  assert.equal(h.spawned.length, 0);
  h.scene.paused = false; h.combat.setPaused(false); h.tick(180);
  assert.equal(h.sounds.filter(sound => sound === 'whiff').length, 1);
  const blocker = target(h, 600, 300);
  h.tick(3000); assert.equal(h.spawned.length, 0);
  blocker.destroy(); h.tick(3001); assert.equal(h.spawned.length, 1);
  h.combat.finish(); h.tick(10000);
  assert.equal(h.combat.fire(), false);
  assert.equal(h.combat.effects.length, 0);
  assert.equal(h.combat.shots.size, 0);
  assert.equal(h.combat.swings.size, 0);
  assert.equal(h.killStatus.textContent, '');
  h.combat.destroy(); h.combat.destroy();
  assert.equal(h.scene.events.listenerCount('player-strike'), 0);
  assert.ok(h.colliders.every(c => c.world === null));
});

test('sword dash restores fading body afterimages, bounded cadence and clean restart', () => {
  const h = setup(), runner = h.runners[0];
  runner.abilities.strike(0);
  const first = h.combat.effects[0];
  assert.equal(first.object.x, runner.player.x);
  assert.equal(first.object.width, runner.player.width);
  assert.equal(first.object.height, runner.player.height);
  assert.equal(first.object.color, 0xffffff);
  assert.equal(first.object.alpha, 0.35);
  runner.player.x += 20;
  h.tick(16); h.tick(31);
  assert.equal(h.combat.effects.length, 1);
  h.tick(32); h.tick(32);
  assert.equal(h.combat.effects.length, 2);
  assert.equal(first.object.x, 400); // Ghost stays behind, never follows the runner.
  assert.equal(h.combat.effects[1].object.x, 420);
  h.tick(80);
  assert.equal(first.object.alpha, 0.175);
  const beforePause = h.combat.effects.length;
  h.scene.paused = true; h.tick(100);
  assert.equal(h.combat.effects.length, beforePause);
  assert.equal(first.object.alpha, 0.175);
  h.scene.paused = false;
  h.tick(160);
  assert.equal(first.object.active, false);
  const lastSpawn = h.combat.lastTrail.get('p1');
  h.tick(180); h.tick(320);
  assert.equal(h.combat.lastTrail.get('p1'), lastSpawn);
  assert.equal(h.combat.effects.length, 0);
  h.combat.destroy();
  assert.equal(h.combat.lastTrail.size, 0);
  const restarted = setup();
  assert.equal(restarted.runners[0].abilities.strikeId, 0);
  assert.equal(restarted.combat.killChains.size, 0);
  assert.equal(restarted.runners[0].abilities.strike(0), true);
  assert.equal(restarted.combat.effects.length, 1);
});

test('dash afterimages respect reduced motion and independently follow both players', () => {
  const reduced = setup(true);
  reduced.runners[0].abilities.strike(0); reduced.tick(32);
  assert.equal(reduced.combat.effects.length, 0);
  assert.equal(reduced.runners[0].abilities.velocity(0, 0, 32).x, 600);
  const h = setup();
  h.runners[1].player.x = 500;
  h.runners.forEach(runner => runner.abilities.strike(0));
  assert.deepEqual(Array.from(h.combat.effects, effect => effect.object.x), [400, 500]);
  h.runners[0].out = true;
  h.tick(32);
  assert.equal(h.combat.lastTrail.get('p1'), 0);
  assert.equal(h.combat.lastTrail.get('p2'), 32);
  h.combat.finish();
  assert.equal(h.combat.effects.length, 0);
});


test('multi-kill audio is coalesced and spoken callouts use only 2/3/5 milestones', () => {
  const h = setup();
  for (let i = 0; i < 7; i++) target(h, 430 + i, 250);
  h.runners[0].abilities.strike(0);
  assert.equal(h.awards.length, 0);
  h.enemies.slice().forEach(enemy => h.combat.contact(enemy, h.runners[0]));
  assert.equal(h.awards.length, 7);
  assert.equal(h.announcements.length, 3);
  assert.match(h.announcements[0], /DOUBLE/);
  assert.match(h.announcements[1], /TRIPLE/);
  assert.match(h.announcements[2], /5 KILL/);
  assert.equal(h.sounds.filter(sound => sound === 'slice').length, 1);
});


test('eliminated owners cannot kill with in-flight bullets before or after the next update', () => {
  const h = setup();
  h.combat.fire('p1'); h.combat.fire('p2');
  const [p1Bullet, p2Bullet] = [...h.combat.shots.keys()];
  const enemy = target(h, 600, 250, 'zipper');
  h.runners[0].out = true;
  // The knockout sprite can remain visible/active; the runner is still out.
  // Physics overlap can run before combat.update prunes the eliminated owner.
  h.colliders[0].callback(p1Bullet, enemy);
  assert.equal(enemy.active, true);
  assert.equal(h.combat.shots.has(p1Bullet), false);
  assert.equal(h.combat.shots.has(p2Bullet), true);
  assert.equal(h.combat.kill(enemy, 'p1', 'shot'), false);
  assert.equal(h.combat.nextShot.get('p1'), 250);
  assert.equal(h.awards.length, 0);
  assert.equal(h.combat.killChains.size, 0);
  assert.equal(h.combat.respawns.length, 0);
  assert.equal(h.sounds.includes('slice'), false);
  h.runners[1].player.active = false;
  h.tick(16);
  assert.equal(h.combat.shots.size, 0);
  h.colliders[0].callback(p2Bullet, enemy);
  assert.equal(enemy.active, true);
  assert.equal(h.awards.length, 0);
});
