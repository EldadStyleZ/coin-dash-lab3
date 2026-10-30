const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function setup({ reducedMotion = false, graphics = true, single = false } = {}) {
  const window = { matchMedia: () => ({ matches: reducedMotion }) };
  for (const name of ['abilities', 'lightning']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../features/${name}.js`), 'utf8'), { window });
  }
  const sounds = [], objects = [];
  const scene = { events: new EventEmitter(), input: { keyboard: new EventEmitter() },
    config: { playerSpeed: 240 }, runTime: 0, paused: false, finished: false, score: 19,
    audio: { play(action) { sounds.push(action); } },
    physics: new Proxy({}, { get() { throw new Error('Cosmetic module must not access physics'); } }) };
  if (graphics) scene.add = { graphics() {
    const object = { scene, commands: [], clears: 0, destroyed: 0, visible: true,
      setDepth(depth) { this.depth = depth; return this; },
      setVisible(visible) { this.visible = visible; return this; },
      setPosition(x, y) { this.x = x; this.y = y; return this; },
      setAlpha(alpha) { this.alpha = alpha; return this; },
      clear() { this.commands = []; this.clears++; return this; },
      destroy() { this.destroyed++; this.scene = null; this.visible = false; }
    };
    for (const name of ['lineStyle', 'beginPath', 'moveTo', 'lineTo', 'strokePath', 'fillStyle', 'fillCircle', 'strokeCircle']) {
      object[name] = (...args) => { object.commands.push({ name, args }); return object; };
    }
    objects.push(object);
    return object;
  } };
  const runners = ['p1', 'p2'].slice(0, single ? 1 : 2).map(id => ({ id, out: false,
    player: { x: id === 'p1' ? 360 : 440, y: 250, active: true,
      body: { enable: true, velocity: { x: 0, y: 0 } } },
    abilities: new window.CoinDashAbilities(scene, { runnerId: id, keys: [id === 'p1' ? 'SPACE' : 'ENTER'] }) }));
  scene.getRunners = () => runners.filter(runner => !runner.out);
  scene.player = runners[0].player;
  scene.abilities = runners[0].abilities;
  const lightning = new window.CoinDashLightning(scene);
  const tick = time => { scene.runTime = time; lightning.update(time, 16); };
  return { lightning, scene, runners, sounds, objects, tick,
    create: () => new window.CoinDashLightning(scene) };
}

test('an accepted real sword strike immediately draws lightning and sounds once without changing gameplay', () => {
  const { lightning, scene, runners, sounds, objects } = setup();
  const ability = runners[0].abilities;
  const body = JSON.stringify(runners[0].player.body);
  assert.equal(ability.strike(0), true);
  assert.equal(objects.length, 1);
  assert.equal(objects[0].visible, true);
  assert.equal(objects[0].depth, 7);
  assert.ok(objects[0].commands.some(command => command.name === 'fillStyle' && command.args[0] === 0xeafcff));
  assert.ok(objects[0].commands.some(command => command.name === 'lineStyle' && command.args[1] === 0x53dfff));
  assert.equal(lightning.effects.get('p1').end, 180);
  assert.equal(lightning.effects.get('p1').expiresAt, 280);
  assert.deepEqual(sounds, ['lightning']);
  assert.equal(ability.nextStrikeAt, 1800);
  assert.equal(ability.strikeEndsAt, 180);
  assert.equal(ability.velocity(0, 0, 0).x, 600);
  assert.equal(ability.velocity(0, 0, 180).x, 0);
  assert.equal(scene.score, 19);
  assert.equal(JSON.stringify(runners[0].player.body), body);
  assert.equal(runners[0].player.x, 360);
});

test('rejected keys, duplicates, fabricated IDs, inactive players and expired strikes never trigger a cue', () => {
  const { lightning, scene, runners, sounds, objects, tick } = setup();
  const ability = runners[0].abilities;
  scene.input.keyboard.emit('keydown-SPACE', { repeat: true });
  scene.input.keyboard.emit('keydown-SPACE', { target: { tagName: 'INPUT' } });
  for (const strikeId of [undefined, 0, -1, 1, NaN, 1.5]) scene.events.emit('player-strike', { runnerId: 'p1', strikeId });
  assert.equal(objects.length, 0);
  assert.equal(ability.strike(0), true);
  for (let i = 0; i < 100; i++) scene.events.emit('player-strike', { runnerId: 'p1', strikeId: 1 });
  assert.equal(ability.strike(100), false);
  scene.events.emit('player-strike', { runnerId: 'p1', strikeId: 2 });
  scene.events.emit('player-strike', { runnerId: 'unknown', strikeId: 1 });
  runners[1].out = true;
  assert.equal(runners[1].abilities.strike(0), true);
  runners[1].out = false;
  tick(180);
  scene.events.emit('player-strike', { runnerId: 'p2', strikeId: 1 });
  assert.equal(sounds.length, 1);
  assert.equal(lightning.effects.has('p2'), false);
});

test('two players track their own locked lunge direction and remain independent', () => {
  const { lightning, runners, sounds, objects, tick } = setup();
  runners[1].abilities.lastDirection = { x: 0, y: -1 };
  runners.forEach(runner => assert.equal(runner.abilities.strike(0), true));
  assert.equal(objects.length, 2);
  assert.equal(objects[0].rotation, 0);
  assert.equal(objects[1].rotation, -Math.PI / 2);
  runners[0].player.x += 24;
  runners[1].player.y -= 24;
  tick(40);
  assert.equal(objects[0].x, 384);
  assert.equal(objects[1].y, 226);
  assert.equal(lightning.effects.size, 2);
  assert.deepEqual(sounds, ['lightning', 'lightning']);
  runners[0].out = true;
  tick(50);
  assert.equal(lightning.effects.has('p1'), false);
  assert.equal(objects[0].visible, false);
  assert.equal(objects[1].visible, true);
  runners[1].player.body.enable = false;
  tick(60);
  assert.equal(lightning.effects.size, 0);
});

test('charge lasts 180ms, then only a short fixed-position tail fades and expires at 280ms', () => {
  const { lightning, runners, objects, tick } = setup();
  runners[0].abilities.strike(0);
  for (let time = 16; time <= 176; time += 16) {
    runners[0].player.x = 360 + time * 0.6;
    tick(time);
  }
  const lastX = objects[0].x;
  assert.ok(lightning.effects.get('p1').history.length <= 4);
  tick(180);
  assert.equal(objects[0].commands.some(command => command.name === 'fillCircle'), false);
  assert.equal(objects[0].alpha, 0.45);
  runners[0].player.x += 100;
  tick(230);
  assert.equal(objects[0].x, lastX);
  assert.equal(objects[0].alpha, 0.225);
  tick(279);
  assert.equal(objects[0].visible, true);
  tick(280);
  assert.equal(objects[0].visible, false);
  assert.equal(objects[0].commands.length, 0);
  assert.equal(lightning.effects.size, 0);
});

test('pause freezes active-time rendering and rejects new effects until resumed', () => {
  const { lightning, scene, runners, objects, sounds, tick } = setup();
  runners[0].abilities.strike(0);
  tick(64);
  const commands = JSON.stringify(objects[0].commands);
  const clears = objects[0].clears;
  scene.paused = true;
  lightning.setPaused(true);
  tick(10000);
  scene.events.emit('player-strike', { runnerId: 'p2', strikeId: 1 });
  assert.equal(lightning.time, 64);
  assert.equal(objects[0].clears, clears);
  assert.equal(JSON.stringify(objects[0].commands), commands);
  assert.equal(sounds.length, 1);
  scene.paused = false;
  lightning.setPaused(false);
  tick(80);
  assert.equal(lightning.effects.size, 1);
  tick(280);
  assert.equal(lightning.effects.size, 0);
});

test('reduced motion keeps a static soft cyan marker with no bolts, flicker or trailing lifetime', () => {
  const { lightning, runners, objects, tick } = setup({ reducedMotion: true });
  runners[0].abilities.strike(0);
  const commands = JSON.stringify(objects[0].commands);
  const clears = objects[0].clears;
  assert.ok(objects[0].commands.some(command => command.name === 'strokeCircle'));
  assert.equal(objects[0].commands.some(command => command.name === 'lineTo'), false);
  assert.equal(lightning.effects.get('p1').history.length, 0);
  for (let time = 16; time < 180; time += 16) {
    runners[0].player.x += 5;
    tick(time);
    assert.equal(objects[0].alpha, 0.8);
    assert.equal(JSON.stringify(objects[0].commands), commands);
  }
  assert.equal(objects[0].clears, clears);
  assert.equal(objects[0].x, runners[0].player.x);
  tick(180);
  assert.equal(lightning.effects.size, 0);
  assert.equal(objects[0].visible, false);
});

test('successful instant reloads reuse two graphics and keep trails and draw work bounded', () => {
  const { lightning, runners, objects, sounds } = setup();
  for (let i = 0; i < 100; i++) {
    for (const runner of runners) {
      assert.equal(runner.abilities.strike(0), true);
      assert.equal(runner.abilities.resetStrike(runner.abilities.strikeId, 0), true);
    }
    assert.equal(objects.length, 2);
    assert.equal(lightning.effects.size, 2);
    for (const graphics of objects) assert.ok(graphics.commands.length < 150);
    for (const effect of lightning.effects.values()) assert.ok(effect.history.length <= 4);
  }
  assert.equal(sounds.length, 200); // Exactly one request per accepted strike; mixer limits actual overlap.
  assert.equal(lightning.lastStrikeIds.size, 2);
});

test('finish and restart remove owned graphics/listeners without touching other event consumers', () => {
  const { lightning, scene, runners, objects, sounds, create, tick } = setup();
  const otherListener = () => {};
  scene.events.on('player-strike', otherListener);
  runners.forEach(runner => runner.abilities.strike(0));
  scene.finished = true;
  tick(16);
  assert.equal(lightning.effects.size, 0);
  assert.equal(lightning.graphics.size, 0);
  objects.forEach(graphics => assert.equal(graphics.destroyed, 1));
  lightning.finish(); lightning.destroy(); lightning.destroy();
  assert.equal(scene.events.listenerCount('player-strike'), 1);
  scene.finished = false;
  scene.runTime = 1800;
  runners[0].abilities.strike(1800);
  assert.equal(sounds.length, 2);
  const fresh = create();
  scene.runTime = 3600;
  assert.equal(runners[0].abilities.strike(3600), true);
  assert.equal(fresh.effects.size, 1);
  assert.equal(sounds.length, 3);
  fresh.destroy();
  assert.equal(scene.events.listenerCount('player-strike'), 1);
  objects.forEach(graphics => assert.equal(graphics.destroyed, 1));
});

test('single-player fallback and missing graphics remain cosmetic and safely expire', () => {
  const { lightning, scene, runners, sounds, tick } = setup({ graphics: false, single: true });
  delete scene.getRunners;
  assert.equal(runners[0].abilities.strike(0), true);
  assert.deepEqual(sounds, ['lightning']);
  assert.equal(lightning.graphics.size, 0);
  for (const time of [NaN, Infinity, -1]) lightning.update(time, 16);
  assert.equal(lightning.time, 0);
  tick(280);
  assert.equal(lightning.effects.size, 0);
  lightning.destroy();
});
