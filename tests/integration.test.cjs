const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the real browser scripts and capture the actual scene class. Only the
// Phaser renderer/physics adapters, DOM, and audio device are replaced; the round,
// score, mission, reaction, rage, collection, and finish logic all run unchanged.
function setup() {
  const elements = new Map();
  const document = {
    activeElement: null,
    getElementById(id) {
      if (id === 'reaction-overlay' || id === 'reaction-controls') return null;
      if (!elements.has(id)) elements.set(id, { textContent: '', disabled: false,
        addEventListener() {}, setAttribute() {}, focus() {} });
      return elements.get(id);
    },
    addEventListener() {}, removeEventListener() {}
  };
  const records = new Map();
  let storageWrites = 0;
  const localStorage = {
    getItem(key) { return records.get(key) || null; },
    setItem(key, value) { storageWrites++; records.set(key, value); }
  };
  let Scene;
  const Phaser = {
    Scene: class {}, AUTO: 0, Scale: { FIT: 0, CENTER_HORIZONTALLY: 0 },
    Game: class { constructor(config) { Scene = config.scene; this.scene = { getScene: () => active }; } }
  };
  const sandbox = { Phaser, document, localStorage };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const filename of ['settings.js', 'features/round.js', 'features/scoring.js',
    'features/reactions.js', 'features/missions.js', 'features/rage.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', filename), 'utf8'), sandbox, { filename });
  }
  const active = new Scene();
  active.config = { ...sandbox.COIN_DASH };
  active.finished = false;
  active.paused = false;
  active.score = 0;
  active.level = 1;
  active.runTime = 0;
  active.round = new sandbox.CoinDashRound(active.config);
  const sounds = [];
  const pauses = [];
  active.audio = { play(action) { sounds.push(action); }, setPaused(paused) { pauses.push(paused); } };
  let physicsPauses = 0;
  let touchResets = 0;
  active.physics = { pause() { physicsPauses++; }, resume() {} };
  active.touch = { reset() { touchResets++; } };
  active.player = { x: 400, y: 300, body: body(0, 0) };
  const enemy = sprite();
  active.drones = { getChildren: () => [enemy], getLength: () => 1 };
  let drawnObjects = 0;
  const draw = () => {
    drawnObjects++;
    return { setDepth() { return this; }, setOrigin() { return this; } };
  };
  active.add = { rectangle: draw, text: draw };
  active.levelHint = { setText(text) { this.text = text; } };
  active.reactions = new sandbox.CoinDashReactions(active);
  active.missions = new sandbox.CoinDashMissions(active);
  active.scoring = new sandbox.CoinDashScoring(active);
  active.rage = new sandbox.CoinDashRage(active);
  const reactionCalls = [];
  const realCoinReaction = active.reactions.coin.bind(active.reactions);
  active.reactions.coin = (...args) => { reactionCalls.push(args); return realCoinReaction(...args); };
  function advance(delta) {
    active.round.advance(delta);
    active.runTime = active.round.elapsed;
    active.level = active.round.level;
  }
  return { active, enemy, sounds, pauses, elements, records, advance, reactionCalls,
    counts: () => ({ storageWrites, physicsPauses, touchResets, drawnObjects }) };
}

function body(x, y) {
  return { enable: true, velocity: {
    x, y,
    set(x, y) { this.x = x; this.y = y; return this; },
    lengthSq() { return this.x ** 2 + this.y ** 2; },
    normalize() { const length = Math.hypot(this.x, this.y); if (length) { this.x /= length; this.y /= length; } return this; },
    scale(value) { this.x *= value; this.y *= value; return this; }
  }, setVelocity(x, y) { this.velocity.set(x, y); return this; } };
}

function sprite() {
  const data = new Map([['type', 'partner-type'], ['speedMultiplier', 1]]);
  return {
    x: 100, y: 100, active: true, body: body(54, 72), tintFill: true, isTinted: true,
    tintTopLeft: 0x112233, tintTopRight: 0x445566, tintBottomLeft: 0x778899, tintBottomRight: 0xaabbcc,
    getData(key) { return data.get(key); }, setData(key, value) { data.set(key, value); },
    data: { has: key => data.has(key), remove: key => data.delete(key) },
    setTint(tl, tr = tl, bl = tl, br = tl) {
      [this.tintTopLeft, this.tintTopRight, this.tintBottomLeft, this.tintBottomRight] = [tl, tr, bl, br];
      this.tintFill = false;
    },
    setTintFill(...colors) { this.setTint(...colors); this.tintFill = true; }
  };
}

test('actual collectCoin applies scoring, exactly +3 seconds, mission progress and matching reactions', () => {
  const h = setup();
  const s = h.active;
  h.advance(12000);
  const before = s.round.secondsRemaining;
  s.collectCoin(150, 220);
  assert.equal(s.score, 1);
  assert.equal(s.scoring.coins, 1);
  assert.equal(s.round.secondsRemaining, before + 3);
  assert.equal(s.round.elapsed, 12000);
  assert.equal(s.round.level, 2);
  assert.equal(s.missions.goals[0].progress, 1);
  assert.equal(s.reactions.rewards.length, 1);
  assert.equal(h.reactionCalls[0][0], 12000);
  assert.deepEqual(JSON.parse(JSON.stringify(h.reactionCalls[0][1])), { points: 1, x: 150, y: 220, bonusSeconds: 3, runnerId: 'p1' });
  assert.equal(h.elements.get('score-value').textContent, '1');
  assert.equal(h.elements.get('time-value').textContent, '51s');
  for (let i = 0; i < 4; i++) { h.advance(100); s.collectCoin(200 + i, 250); }
  assert.equal(s.score, 8); // Real combo: 1 + 1 + 2 + 2 + 2.
  assert.equal(s.round.duration, 75000); // Five coins, not five point awards.
  assert.equal(s.missions.goals[0].complete, true);
  // Mission completion must not replace a recent coin joke or add another voice.
  assert.equal(s.reactions.captionText, 'Coin vacuum: activated!');
  assert.equal(s.reactions.rewards.length, 5);
  assert.equal(h.sounds.filter(sound => sound === 'coin').length, 5);
  assert.equal(h.sounds.filter(sound => sound === 'level').length, 1);
});

test('actual collectCoin ignores paused and finished rounds without rewards or feedback', () => {
  const h = setup();
  const s = h.active;
  const snapshot = () => ({ score: s.score, coins: s.scoring.coins, duration: s.round.duration,
    mission: s.missions.goals[0].progress, reactions: h.reactionCalls.length, sounds: h.sounds.length });
  s.setPaused(true);
  const paused = snapshot();
  s.collectCoin(150, 220);
  assert.deepEqual(snapshot(), paused);
  s.setPaused(false);
  s.collectCoin(150, 220);
  s.finish('Out of lives!');
  const finished = snapshot();
  s.collectCoin(150, 220);
  assert.deepEqual(snapshot(), finished);
});

test('actual finish immediately restores active rage and remains idempotent after update stops', () => {
  const h = setup();
  const s = h.active;
  h.advance(8000);
  s.rage.update(s.runTime, 16);
  assert.equal(h.enemy.getData('enraged'), true);
  assert.equal(h.enemy.tintTopLeft, 0xff3030);
  assert.ok(Math.abs(Math.hypot(h.enemy.body.velocity.x, h.enemy.body.velocity.y) - 63) < 1e-8);
  s.finish('Out of lives!');
  assert.equal(s.finished, true);
  assert.equal(s.round.finished, true);
  assert.equal(s.rage.target, null);
  assert.equal(h.enemy.data.has('enraged'), false);
  assert.equal(h.enemy.getData('type'), 'partner-type');
  assert.deepEqual([h.enemy.tintTopLeft, h.enemy.tintTopRight, h.enemy.tintBottomLeft, h.enemy.tintBottomRight],
    [0x112233, 0x445566, 0x778899, 0xaabbcc]);
  assert.equal(h.enemy.tintFill, true);
  assert.ok(Math.abs(h.enemy.body.velocity.x - 54) < 1e-8);
  assert.ok(Math.abs(h.enemy.body.velocity.y - 72) < 1e-8);
  assert.equal(h.elements.get('rage-status').textContent, 'Rage ended');
  assert.equal(h.elements.get('pause-game').disabled, true);
  assert.equal(s.reactions.paused, true);
  const counts = h.counts();
  s.finish('Duplicate finish');
  s.update(20000, 12000); // Actual scene stops updating once finished.
  assert.deepEqual(h.counts(), counts);
  assert.equal(h.sounds.filter(sound => sound === 'gameover').length, 1);
  assert.equal(counts.physicsPauses, 1);
  assert.equal(counts.drawnObjects, 2);
});


test('actual bonus award never adds coin time or mission progress', () => {
  const h = setup(), s = h.active;
  const duration = s.round.duration;
  assert.equal(s.awardPoints(5, 'slice-chaser'), 5);
  assert.equal(s.awardPoints(2, 'near-miss'), 2);
  assert.equal(s.score, 7);
  assert.equal(s.round.duration, duration);
  assert.equal(s.scoring.coins, 0);
  assert.equal(s.missions.goals[0].progress, 0);
  s.collectCoin(100, 100);
  assert.equal(s.score, 8);
  assert.equal(s.round.duration, duration + 3000);
});
