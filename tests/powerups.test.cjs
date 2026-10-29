const test = require('node:test');
const assert = require('node:assert/strict');
const CoinDashPowerups = require('../features/powerups.js');
const { PowerupState, magnetPosition } = CoinDashPowerups;

test('first shield spawns at six seconds, expires at fourteen, then magnet at eighteen', () => {
  const state = new PowerupState();
  state.update(5999); assert.equal(state.pickup, null);
  state.update(6000); assert.deepEqual(state.pickup, { type: 'shield', expiresAt: 14000 });
  const pickup = state.pickup;
  state.update(13999); assert.equal(state.pickup, pickup);
  state.update(14000); assert.equal(state.pickup, null);
  state.update(18000); assert.equal(state.pickup.type, 'magnet');
  state.update(30000); assert.equal(state.pickup.type, 'speed');
  state.update(42000); assert.equal(state.pickup.type, 'shield');
});

test('collecting removes world pickup without advancing the scheduled spawn', () => {
  const state = new PowerupState();
  state.update(6000);
  assert.equal(state.collect(6500), 'shield');
  assert.equal(state.pickup, null);
  assert.equal(state.nextSpawnAt, 18000);
  assert.equal(state.collect(6500), null);
});

test('shield blocks one hit and exactly 400ms of repeated collision callbacks', () => {
  const state = new PowerupState();
  state.update(6000); state.collect(6000);
  assert.equal(state.absorbHit(7000), true);
  assert.equal(state.shieldReady, false);
  assert.equal(state.absorbHit(7000), true);
  assert.equal(state.absorbHit(7399), true);
  assert.equal(state.absorbHit(7400), false);
  assert.equal(state.absorbHit(8000), false);
});

test('unused shield expires after ten active seconds; invalid timestamps cannot consume it', () => {
  const state = new PowerupState();
  state.update(6000); state.collect(6000);
  assert.equal(state.absorbHit(NaN), false);
  assert.equal(state.absorbHit(-1), false);
  assert.equal(state.shieldActive(15999), true);
  assert.equal(state.absorbHit(16000), false);
  assert.equal(state.collect(Infinity), null);
});

test('magnet lasts eight active seconds, pickup cannot be collected at expiry', () => {
  const state = new PowerupState();
  state.update(6000);
  assert.equal(state.collect(14000), null);
  state.update(18000);
  assert.equal(state.collect(18000), 'magnet');
  assert.equal(state.magnetActive(25999), true);
  assert.equal(state.magnetActive(26000), false);
});

test('magnet movement is delta-scaled, bounded by radius and never overshoots', () => {
  assert.deepEqual(magnetPosition({ x: 100, y: 0 }, { x: 0, y: 0 }, 100), { x: 74, y: 0 });
  assert.deepEqual(magnetPosition({ x: 100, y: 0 }, { x: 0, y: 0 }, 50), { x: 87, y: 0 });
  assert.deepEqual(magnetPosition({ x: 141, y: 0 }, { x: 0, y: 0 }, 1000), { x: 141, y: 0 });
  assert.deepEqual(magnetPosition({ x: 140, y: 0 }, { x: 0, y: 0 }, 1000), { x: 0, y: 0 });
  assert.deepEqual(magnetPosition({ x: 0, y: 0 }, { x: 0, y: 0 }, 100), { x: 0, y: 0 });
  assert.deepEqual(magnetPosition({ x: 10, y: 0 }, { x: 0, y: 0 }, -100), { x: 10, y: 0 });
});

function setup() {
  const objects = [];
  const makeObject = (x, y) => {
    const object = { x, y, destroyed: false, setStrokeStyle() { return this; }, setOrigin() { return this; },
      setVisible(value) { this.visible = value; return this; }, setPosition(x, y) { this.x = x; this.y = y; return this; },
      destroy() { assert.equal(this.destroyed, false, 'object destroyed twice'); this.destroyed = true; } };
    objects.push(object); return object;
  };
  const scene = { config: { width: 800, height: 500 }, player: { x: 400, y: 250, alpha: 0.35 },
    coin: { x: 480, y: 250, active: true, body: { resets: 0, reset() { this.resets++; } },
      setPosition(x, y) { this.x = x; this.y = y; } },
    add: { circle: makeObject, text: makeObject }, paused: false, finished: false, score: 7 };
  return { scene, objects, powerups: new CoinDashPowerups(scene) };
}

test('adapter freezes while paused/finished and destroys all objects on shutdown', () => {
  const { scene, powerups, objects } = setup();
  scene.paused = true; powerups.update(6000, 16);
  assert.equal(powerups.pickup, null);
  scene.paused = false; powerups.update(6000, 16);
  const pickup = powerups.pickup;
  assert(pickup);
  assert(Math.hypot(pickup.x - scene.player.x, pickup.y - scene.player.y) >= 85);
  scene.paused = true; powerups.update(14000, 8000);
  assert.equal(powerups.pickup, pickup);
  scene.paused = false;
  scene.player.x = pickup.x; scene.player.y = pickup.y;
  powerups.update(6001, 1);
  assert.equal(powerups.pickup, null);
  assert.equal(powerups.state.shieldReady, true);
  assert.equal(scene.player.alpha, 0.35);
  scene.finished = true;
  assert.equal(powerups.absorbHit(6002), false);
  powerups.destroy(); powerups.destroy();
  assert(objects.every(object => object.destroyed));
  powerups.update(18000, 12000);
  assert.equal(powerups.pickup, null);
});

test('adapter magnet synchronizes physics without changing score or player alpha', () => {
  const { scene, powerups } = setup();
  powerups.state.magnetUntil = 8000;
  powerups.update(1000, 100);
  assert.equal(scene.coin.x, 454);
  assert.equal(scene.coin.body.resets, 1);
  assert.equal(scene.score, 7);
  assert.equal(scene.player.alpha, 0.35);
  scene.paused = true; powerups.update(1000, 100);
  assert.equal(scene.coin.x, 454);
  powerups.destroy();
});

test('finite spawn attempts fall back to a distant corner when random points hit player', () => {
  const { powerups, scene } = setup();
  const originalRandom = Math.random;
  // Center of the legal spawn rectangle is (400, 266).
  scene.player.y = 266;
  let attempts = 0;
  try {
    Math.random = () => { attempts++; return 0.5; };
    const point = powerups.spawnPosition();
    assert.equal(attempts, 32);
    assert(Math.hypot(point.x - scene.player.x, point.y - scene.player.y) >= 85);
  } finally { Math.random = originalRandom; }
});

test('collecting a special coin emits exactly once with its type and position', () => {
  const { scene, powerups } = setup();
  const events = [];
  scene.events = { emit: (name, payload) => events.push({ name, payload }) };
  powerups.update(6000, 16);
  const { x, y } = powerups.pickup;
  scene.player.x = x; scene.player.y = y;
  const coinBefore = { x: scene.coin.x, y: scene.coin.y };
  powerups.update(6001, 1);
  powerups.update(6017, 16);
  assert.deepEqual(events, [{ name: 'special-coin', payload: { type: 'shield', x, y, runnerId: 'p1' } }]);
  assert.equal(scene.score, 7, 'core owns the score');
  assert.deepEqual({ x: scene.coin.x, y: scene.coin.y }, coinBefore, 'special collection does not relocate the normal coin');
  assert.equal(powerups.state.shieldReady, true);
  powerups.destroy();
});

test('arena query caps magnet steps to 12px and prevents entering or crossing a wall', () => {
  const player = { x: 100, y: 0 };
  const clear = (x, y, radius) => {
    assert.equal(radius, 12);
    return x + radius < 40 || x - radius > 45;
  };
  let coin = { x: 0, y: 0 };
  coin = magnetPosition(coin, player, 1000, clear);
  assert.deepEqual(coin, { x: 12, y: 0 });
  for (let i = 0; i < 20; i++) coin = magnetPosition(coin, player, 1000, clear);
  assert.deepEqual(coin, { x: 24, y: 0 }, 'large deltas cannot tunnel through the wall');
  assert.deepEqual(magnetPosition({ x: 0, y: 0 }, player, 1000), { x: 100, y: 0 }, 'legacy no-wall behavior is retained');
});

test('blocked random points and corners use a finite safe grid fallback', () => {
  const { powerups, scene } = setup();
  scene.player.y = 266;
  let queries = 0;
  scene.isSpawnClear = (x, y, radius) => {
    queries++;
    assert.equal(radius, 20);
    return x >= 250 && x <= 300 && y >= 150 && y <= 200;
  };
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.5;
    const point = powerups.spawnPosition();
    assert(point);
    assert(scene.isSpawnClear(point.x, point.y, 20));
    assert(queries > 4 && queries <= 1109);
  } finally { Math.random = originalRandom; }
});

test('completely blocked arenas skip a special coin without creating world objects', () => {
  const { powerups, scene, objects } = setup();
  let queries = 0;
  scene.isSpawnClear = () => { queries++; return false; };
  powerups.update(6000, 16);
  assert.equal(powerups.pickup, null);
  assert.equal(powerups.state.pickup, null);
  assert.equal(powerups.state.nextSpawnAt, 18000);
  assert.equal(objects.length, 0);
  assert(queries <= 1109);
  powerups.destroy();
});

test('scene adapter passes its geometry query to coin attraction', () => {
  const { powerups, scene } = setup();
  powerups.state.magnetUntil = 8000;
  let queries = 0;
  scene.isSpawnClear = (x, y, radius) => { queries++; assert.equal(radius, 12); return false; };
  powerups.update(1000, 100);
  assert.equal(scene.coin.x, 480);
  assert.equal(scene.coin.body.resets, 0);
  assert.equal(queries, 1);
  powerups.destroy();
});

function setupTwo() {
  const fixture = setup();
  fixture.runners = [
    { id: 'p1', player: fixture.scene.player, lives: { remaining: 3 } },
    { id: 'p2', player: { x: 600, y: 350, active: true, body: { enable: true }, alpha: 1 }, lives: { remaining: 3 } }
  ];
  fixture.scene.getRunners = () => fixture.runners;
  fixture.events = [];
  fixture.scene.events = { emit: (name, payload) => fixture.events.push({ name, payload }) };
  return fixture;
}

test('speed activates at 1.6x for five active seconds and the cycle returns to shield', () => {
  const state = new PowerupState();
  state.update(6000); state.update(18000); state.update(30000);
  assert.equal(state.collect(30000), 'speed');
  assert.equal(state.speedMultiplier(30000), 1.6);
  assert.equal(state.speedMultiplier(34999), 1.6);
  assert.equal(state.speedMultiplier(35000), 1);
  assert.equal(state.speedMultiplier(NaN), 1);
  state.update(42000); assert.equal(state.pickup.type, 'shield');
});

test('P2 collects one special coin, receives its shield, and P1 cannot spend it', () => {
  const { powerups, runners, events } = setupTwo();
  powerups.update(6000, 16);
  const { x, y } = powerups.pickup;
  runners[1].player.x = x; runners[1].player.y = y;
  powerups.update(6001, 1); powerups.update(6017, 16);
  assert.deepEqual(events, [{ name: 'special-coin', payload: { type: 'shield', x, y, runnerId: 'p2' } }]);
  assert.equal(powerups.absorbHit(6100, 'p1'), false);
  assert.equal(powerups.absorbHit(6100, 'p2'), true);
  assert.equal(powerups.absorbHit(6499, 'p2'), true);
  assert.equal(powerups.absorbHit(6500, 'p2'), false);
  assert.equal(powerups.state.shieldReady, false);
  powerups.destroy();
});

test('both players hold independent shields and speed belongs only to its collector', () => {
  const { powerups, runners } = setupTwo();
  powerups.state.activate('shield', 1000);
  powerups.effectFor('p2').activate('shield', 1000);
  assert.equal(powerups.absorbHit(1100, 'p1'), true);
  assert.equal(powerups.effectFor('p2').shieldReady, true);
  assert.equal(powerups.absorbHit(1200, 'p2'), true);
  powerups.update(6000, 16); powerups.update(18000, 16); powerups.update(30000, 16);
  const { x, y } = powerups.pickup;
  runners[1].player.x = x; runners[1].player.y = y;
  powerups.update(30001, 1);
  assert.equal(powerups.speedMultiplier(30001, 'p1'), 1);
  assert.equal(powerups.speedMultiplier(30001, 'p2'), 1.6);
  assert.equal(powerups.speedMultiplier(35001, 'p2'), 1);
  powerups.destroy();
});

test('magnet follows its active collector and dead runners cannot collect or keep effects', () => {
  const { powerups, scene, runners, events } = setupTwo();
  const p2 = runners[1];
  powerups.effectFor('p2').activate('magnet', 1000);
  powerups.effectFor('p2').activate('speed', 1000);
  scene.coin.x = 680; scene.coin.y = 350;
  powerups.update(1000, 100);
  assert.equal(scene.coin.x, 654, 'coin moves toward P2, not P1');
  assert.equal(powerups.speedMultiplier(1001, 'p2'), 1.6);
  p2.lives.remaining = 0;
  powerups.update(1100, 100);
  assert.equal(scene.coin.x, 654);
  assert.equal(powerups.speedMultiplier(1100, 'p2'), 1);
  powerups.update(6000, 16);
  p2.player.x = powerups.pickup.x; p2.player.y = powerups.pickup.y;
  powerups.update(6001, 1);
  assert(powerups.pickup, 'dead player cannot consume the coin');
  assert.equal(events.length, 0);
  powerups.destroy();
});

test('safe spawn avoids both active players and status identifies their effects', () => {
  const { powerups, runners } = setupTwo();
  powerups.status = { textContent: '' };
  powerups.state.activate('shield', 1000);
  powerups.effectFor('p2').activate('speed', 1000);
  powerups.renderStatus(1000);
  assert.match(powerups.status.textContent, /P1: Shield/);
  assert.match(powerups.status.textContent, /P2: Speed/);
  const point = powerups.spawnPosition();
  for (const { player } of runners) assert(Math.hypot(point.x - player.x, point.y - player.y) >= 85);
  powerups.finish();
  assert.equal(powerups.status.textContent, '');
  assert.equal(powerups.speedMultiplier(1001, 'p2'), 1);
  assert.equal(powerups.absorbHit(1001, 'p1'), false);
  powerups.update(6000, 16); assert.equal(powerups.pickup, null);
  powerups.destroy();
});
