const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function sprite(x, y) {
  return {
    x, y, width: 32, height: 32, alpha: 1, active: true, destroyed: 0, data: {},
    setData(key, value) { this.data[key] = value; return this; },
    setTint(tint) { this.tint = tint; return this; },
    setAlpha(alpha) { this.alpha = alpha; return this; },
    destroy() { this.destroyed++; this.active = false; this.body = null; }
  };
}
function addBody(player) {
  player.body = {
    enable: true, velocity: { x: 0, y: 0 },
    setVelocity(x, y) { this.velocity = { x, y }; return this; },
    setSize(width, height, center) { this.size = { width, height, center }; return this; },
    setCollideWorldBounds(value) { this.collideWorldBounds = value; return this; },
    reset(x, y) { player.x = x; player.y = y; this.setVelocity(0, 0); }
  };
}
function setup(playerCount = 2, startingLives = 3) {
  const nodes = {};
  for (const id of ['lives-status', 'strike-status', 'p2-lives-status', 'p2-strike-status', 'multiplayer-status']) {
    let value = '';
    nodes[id] = { writes: 0, hidden: id.startsWith('p2'), attributes: {},
      get textContent() { return value; },
      set textContent(text) { value = text; this.writes++; },
      setAttribute(name, text) { this.attributes[name] = text; } };
  }
  const document = { activeElement: null, getElementById(id) { return nodes[id]; } };
  const sandbox = { window: {}, document };
  for (const file of ['lives', 'abilities', 'multiplayer']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../features/${file}.js`), 'utf8'), sandbox);
  }
  const keyboard = new EventEmitter();
  const player = sprite(400, 250);
  addBody(player);
  const colliders = [];
  const boosts = { p1: 1, p2: 1 };
  const boostCalls = [];
  const scene = {
    config: { playerCount, playerSpeed: 240, startingLives, invulnerabilityMs: 1500 },
    player, input: { keyboard }, events: new EventEmitter(), paused: false, finished: false, runTime: 0,
    keys: Object.fromEntries(['W', 'A', 'S', 'D'].map(key => [key, { isDown: false }])),
    cursors: Object.fromEntries(['up', 'down', 'left', 'right'].map(key => [key, { isDown: false }])),
    touch: { x: 0, y: 0, direction() { return { x: this.x, y: this.y }; } },
    powerups: { speedMultiplier(time, id) { boostCalls.push({ time, id }); return boosts[id]; } },
    arena: { obstacles: {} },
    physics: { add: { existing: addBody, collider(player, obstacles) {
      const collider = { player, obstacles, destroyed: 0, destroy() { this.destroyed++; } };
      colliders.push(collider); return collider;
    } } },
    add: { rectangle: sprite }
  };
  sandbox.window.CoinDashVisuals = { createPlayer(owner, x, y) { assert.equal(owner, scene); return sprite(x, y); } };
  scene.lives = sandbox.window.CoinDashLives.create(scene, { maxLives: startingLives, invulnerabilityMs: 1500 });
  scene.abilities = new sandbox.window.CoinDashAbilities(scene);
  const multiplayer = new sandbox.window.CoinDashMultiplayer(scene);
  return { scene, multiplayer, nodes, document, keyboard, colliders, boosts, boostCalls };
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const speed = runner => Math.hypot(runner.player.body.velocity.x, runner.player.body.velocity.y);

test('single-player reuses owned modules, preserves the start, and normalizes arrows/WASD/touch', () => {
  const { scene, multiplayer, nodes, colliders } = setup(1);
  const p1 = multiplayer.getRunner('p1');
  assert.equal(p1.lives, scene.lives);
  assert.equal(p1.abilities, scene.abilities);
  assert.equal(p1.player.x, 400);
  assert.equal(multiplayer.getRunners().length, 1);
  assert.equal(colliders.length, 0);
  assert.equal(nodes['p2-lives-status'].hidden, true);
  scene.cursors.right.isDown = true;
  scene.keys.W.isDown = true;
  scene.touch.x = 1;
  multiplayer.update(0, 16);
  close(speed(p1), 240);
  assert.ok(p1.player.body.velocity.x > 0);
  assert.ok(p1.player.body.velocity.y < 0);
  scene.cursors.right.isDown = false;
  scene.keys.W.isDown = false;
  scene.touch.x = 0;
  multiplayer.update(16, 16);
  assert.equal(speed(p1), 0);
});

test('two-player bodies and controls stay separate with normalized diagonals', () => {
  const { scene, multiplayer, nodes, colliders } = setup();
  const p1 = multiplayer.getRunner('p1');
  const p2 = multiplayer.getRunner('p2');
  assert.equal(p1.player.x, 360);
  assert.equal(p2.player.x, 440);
  assert.equal(p2.player.tint, 0x69aaff);
  assert.deepEqual(p2.player.body.size, { width: 22.4, height: 22.4, center: true });
  assert.equal(p2.player.body.collideWorldBounds, true);
  assert.equal(colliders[0].obstacles, scene.arena.obstacles);
  assert.equal(colliders[0].player, p2.player);
  assert.equal(nodes['p2-lives-status'].hidden, false);
  assert.equal(nodes['p2-strike-status'].hidden, false);
  scene.cursors.right.isDown = scene.cursors.down.isDown = true;
  multiplayer.update(0, 16);
  assert.equal(speed(p1), 0);
  close(speed(p2), 240);
  scene.keys.W.isDown = scene.keys.A.isDown = true;
  multiplayer.update(16, 16);
  close(speed(p1), 240);
  close(speed(p2), 240);
  assert.ok(p1.player.body.velocity.x < 0 && p2.player.body.velocity.x > 0);
});

test('form focus suppresses both keyboard controls while touch belongs only to P1', () => {
  const { scene, multiplayer, document } = setup();
  scene.keys.D.isDown = scene.cursors.left.isDown = true;
  for (const activeElement of [{ tagName: 'INPUT' }, { tagName: 'SELECT' }, { isContentEditable: true }]) {
    document.activeElement = activeElement;
    multiplayer.update(0, 16);
    multiplayer.runners.forEach(runner => assert.equal(speed(runner), 0));
  }
  scene.touch.y = 1;
  multiplayer.update(16, 16);
  assert.equal(multiplayer.getRunner('p1').player.body.velocity.y, 240);
  assert.equal(speed(multiplayer.getRunner('p2')), 0);
});

test('real sword dashes use Space for P1 and Enter for P2; Shift stays disabled', () => {
  const { scene, multiplayer, keyboard, nodes } = setup();
  const p1 = multiplayer.getRunner('p1');
  const p2 = multiplayer.getRunner('p2');
  const events = [];
  scene.events.on('player-strike', event => events.push(event.runnerId));
  scene.keys.D.isDown = scene.cursors.up.isDown = true;
  multiplayer.update(0, 16);
  keyboard.emit('keydown-SHIFT', { target: { tagName: 'CANVAS' } });
  assert.equal(p1.abilities.strikeId, 0);
  keyboard.emit('keydown-SPACE', { target: { tagName: 'CANVAS' } });
  multiplayer.update(10, 10);
  close(speed(p1), 600);
  close(speed(p2), 240);
  assert.equal(p2.abilities.nextStrikeAt, 0);
  keyboard.emit('keydown-ENTER', { target: { tagName: 'CANVAS' } });
  multiplayer.update(20, 10);
  assert.equal(p2.player.body.velocity.y, -600);
  assert.deepEqual(events, ['p1', 'p2']);
  assert.equal(nodes['p2-strike-status'].textContent, 'Striking!');
});

test('speed pickup multipliers are applied by runner after direction and strike calculation', () => {
  const { scene, multiplayer, boosts, boostCalls } = setup();
  scene.keys.D.isDown = scene.cursors.left.isDown = true;
  boosts.p2 = 1.5;
  multiplayer.update(321, 16);
  assert.equal(multiplayer.getRunner('p1').player.body.velocity.x, 240);
  assert.equal(multiplayer.getRunner('p2').player.body.velocity.x, -360);
  assert.deepEqual(boostCalls, [{ time: 321, id: 'p1' }, { time: 321, id: 'p2' }]);
});

test('real per-player lives have separate immunity and HUDs, and knockouts do not end the other player', () => {
  const { scene, multiplayer, nodes } = setup(2, 2);
  const p1 = multiplayer.getRunner('p1');
  const p2 = multiplayer.getRunner('p2');
  assert.equal(multiplayer.hit(p1, 0).remaining, 1);
  assert.equal(multiplayer.hit(p1, 1499).damaged, false);
  assert.equal(multiplayer.hit(p2, 500).remaining, 1);
  assert.equal(multiplayer.hit(p2, 1500).damaged, false);
  assert.equal(nodes['lives-status'].textContent, '♥♡ 1 / 2');
  assert.equal(nodes['p2-lives-status'].textContent, '♥♡ 1 / 2');
  const result = multiplayer.hit(p1, 1500);
  assert.equal(result.dead, true);
  assert.equal(result.allOut, false);
  assert.equal(scene.finished, false);
  assert.equal(p1.player.body.enable, false);
  assert.equal(p1.player.alpha, 0.45);
  assert.equal(p1.abilities.disabled, true);
  assert.equal(p1.abilities.strike(2000), false);
  assert.equal(multiplayer.getRunners()[0], p2);
  assert.equal(multiplayer.getRunner('p1'), p1);
  scene.keys.W.isDown = scene.cursors.right.isDown = true;
  multiplayer.update(1600, 16);
  assert.equal(speed(p1), 0);
  assert.equal(p1.player.alpha, 0.45);
  assert.equal(speed(p2), 240);
  assert.equal(multiplayer.hit(p1, 10000).damaged, false);
  assert.equal(multiplayer.hit(p2, 2000).allOut, true);
  assert.equal(multiplayer.getRunners().length, 0);
  assert.equal(p2.abilities.scene.finished, true);
  assert.equal(p2.abilities.strike(3000), false);
});

test('scores remain per player, render only on changes, and summaries report wins and ties', () => {
  const { multiplayer, nodes } = setup(2, 1);
  const writes = nodes['multiplayer-status'].writes;
  multiplayer.render();
  multiplayer.update(0, 16);
  assert.equal(nodes['multiplayer-status'].writes, writes);
  assert.match(multiplayer.summary(), /Draw!/);
  assert.equal(multiplayer.record(5, 'p1'), 5);
  multiplayer.record(3, 'p2');
  assert.match(multiplayer.summary(), /P1: 5.*P2: 3.*P1 wins!/);
  multiplayer.record(4, 'p2');
  assert.match(multiplayer.summary(), /P2 wins!/);
  const p2 = multiplayer.getRunner('p2');
  multiplayer.hit(p2, 0);
  assert.equal(multiplayer.record(100, 'p2'), 7);
  assert.match(nodes['multiplayer-status'].textContent, /P2: 7 OUT/);
  assert.equal(multiplayer.record(NaN, 'p1'), 5);
  assert.equal(multiplayer.record(-1, 'p1'), 5);
  assert.equal(multiplayer.record(4, 'unknown'), 0);
  const single = setup(1).multiplayer;
  single.record(9);
  assert.equal(single.summary(), '9 points');
});

test('pause and finish stop motion, ignore hits/scores, and use the same active clock', () => {
  const { scene, multiplayer } = setup();
  const p1 = multiplayer.getRunner('p1');
  const p2 = multiplayer.getRunner('p2');
  scene.keys.D.isDown = scene.cursors.right.isDown = true;
  multiplayer.hit(p1, 100);
  multiplayer.update(200, 16);
  const alpha = p1.player.alpha;
  scene.paused = true;
  multiplayer.setPaused(true);
  assert.equal(speed(p1), 0);
  assert.equal(speed(p2), 0);
  for (let i = 0; i < 10; i++) multiplayer.update(200, 1000);
  assert.equal(p1.player.alpha, alpha);
  assert.equal(multiplayer.hit(p2, 200).damaged, false);
  assert.equal(multiplayer.record(50, 'p1'), 0);
  assert.equal(p2.abilities.strike(200), false);
  scene.paused = false;
  multiplayer.setPaused(false);
  multiplayer.update(200, 16);
  assert.equal(speed(p1), 240);
  assert.equal(multiplayer.hit(p1, 200).damaged, false);
  scene.finished = true;
  multiplayer.update(220, 20);
  assert.equal(speed(p1), 0);
  assert.equal(multiplayer.hit(p2, 220).damaged, false);
  assert.equal(multiplayer.record(50, 'p1'), 0);
  assert.equal(p2.abilities.scene.finished, true);
});

test('destroy releases only P2 resources and restores status visibility once', () => {
  const { scene, multiplayer, nodes, keyboard, colliders } = setup();
  const p2 = multiplayer.getRunner('p2');
  multiplayer.hit(p2, 0);
  assert.equal(keyboard.listenerCount('keydown-ENTER'), 1);
  multiplayer.destroy();
  multiplayer.destroy();
  assert.equal(colliders[0].destroyed, 1);
  assert.equal(p2.player.destroyed, 1);
  assert.equal(p2.player.alpha, 1);
  assert.equal(p2.lives.hit(2000).damaged, false);
  assert.equal(p2.abilities.destroyed, true);
  assert.equal(keyboard.listenerCount('keydown-ENTER'), 0);
  assert.equal(keyboard.listenerCount('keydown-SPACE'), 1);
  assert.equal(scene.abilities.destroyed, false);
  assert.equal(scene.player.destroyed, 0);
  assert.equal(scene.lives.hit(2000).damaged, true);
  assert.equal(nodes['p2-lives-status'].hidden, true);
  assert.equal(nodes['p2-strike-status'].hidden, true);
  assert.equal(multiplayer.getRunners().length, 0);
  const writes = nodes['multiplayer-status'].writes;
  multiplayer.update(3000, 16);
  multiplayer.record(99, 'p1');
  assert.equal(nodes['multiplayer-status'].writes, writes);
});
