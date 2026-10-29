const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(path.join(__dirname, '../features/missions.js'), 'utf8');

function setup(withDom = true) {
  let text = '';
  let writes = 0;
  const element = {
    setAttribute() {},
    get textContent() { return text; },
    set textContent(value) { writes++; text = value; }
  };
  const window = {};
  if (withDom) window.document = { getElementById(id) { return id === 'mission-status' ? element : null; } };
  vm.runInNewContext(source, { window });
  const messages = [];
  const sounds = [];
  const scene = {
    events: new EventEmitter(), level: 1, runTime: 0, score: 0, paused: false, finished: false,
    reactions: { announce(message) { messages.push(message); } },
    audio: { play(action) { sounds.push(action); } }
  };
  return { Missions: window.CoinDashMissions, scene, messages, sounds, element, writes: () => writes };
}

test('round begins with three finite visible goals and no reward', () => {
  const h = setup();
  new h.Missions(h.scene);
  assert.match(h.element.textContent, /Collect 5 coins: 0\/5/);
  assert.match(h.element.textContent, /Land 3 sword kills: 0\/3/);
  assert.match(h.element.textContent, /Reach level 3: 1\/3/);
  assert.equal(h.messages.length, 0);
});

test('button presses and misses never earn sword praise; only actual sword kills advance the goal', () => {
  const h = setup();
  const missions = new h.Missions(h.scene);
  for (let i = 0; i < 10; i++) {
    h.scene.events.emit('player-strike', { runnerId: 'p1', strikeId: i + 1 });
    h.scene.events.emit('strike-missed', { runnerId: 'p1', time: i * 1800 });
    h.scene.events.emit('enemy-killed', { runnerId: 'p1', cause: 'shot' });
  }
  assert.equal(missions.goals[1].progress, 0);
  assert.equal(h.messages.length, 0);
  for (let i = 0; i < 3; i++) h.scene.events.emit('enemy-killed', { runnerId: 'p1', cause: 'enemy' });
  assert.equal(missions.goals[1].complete, true);
  assert.deepEqual(h.messages, ['Sword goal complete: 3 kills.']);
  missions.destroy();
  assert.equal(h.scene.events.listenerCount('enemy-killed'), 0);
});

test('each goal completes once and all goals celebrate once', () => {
  const h = setup();
  const missions = new h.Missions(h.scene);
  for (let i = 0; i < 20; i++) missions.coin();
  assert.equal(h.messages.length, 1);
  assert.match(h.element.textContent, /✓ Collect 5 coins/);
  for (let i = 0; i < 20; i++) missions.swordKill();
  assert.equal(h.messages.length, 2);
  h.scene.level = 3;
  for (let i = 0; i < 100; i++) missions.update(i * 16);
  assert.equal(h.messages.length, 4);
  assert.equal(h.messages.filter(message => /All three/.test(message)).length, 1);
  assert.deepEqual(h.sounds, ['level', 'level', 'level', 'level']);
  assert.match(h.element.textContent, /✓ Reach level 3/);
  assert.match(h.element.textContent, /All goals complete/);
});

test('paused and finished rounds cannot progress or trigger feedback', () => {
  const h = setup();
  const missions = new h.Missions(h.scene);
  const before = h.element.textContent;
  h.scene.paused = true;
  h.scene.level = 9;
  for (let i = 0; i < 10; i++) { missions.coin(); missions.swordKill(); missions.update(10000); }
  assert.equal(h.element.textContent, before);
  assert.equal(missions.lastTime, 0);
  assert.equal(h.messages.length, 0);
  h.scene.paused = false;
  h.scene.finished = true;
  missions.coin(); missions.swordKill(); missions.update(10000);
  assert.equal(h.element.textContent, before);
  assert.equal(h.messages.length, 0);
});

test('new round starts fresh and old destroyed instance cannot touch its UI', () => {
  const h = setup();
  const old = new h.Missions(h.scene);
  for (let i = 0; i < 5; i++) old.coin();
  old.destroy();
  old.destroy();
  const restarted = new h.Missions(h.scene);
  const resetText = h.element.textContent;
  old.coin(); old.swordKill(); old.update(100);
  assert.equal(h.element.textContent, resetText);
  assert.equal(restarted.goals[0].progress, 0);
  for (let i = 0; i < 5; i++) restarted.coin();
  assert.equal(h.messages.length, 2);
});

test('frame updates write only when progress changes and reject invalid clocks', () => {
  const h = setup();
  const missions = new h.Missions(h.scene);
  for (let i = 0; i < 100; i++) missions.update(i * 16);
  assert.equal(h.writes(), 1);
  h.scene.level = 3;
  for (const time of [undefined, NaN, Infinity, -1, 0, '2000']) missions.update(time);
  assert.equal(h.writes(), 1);
  assert.equal(h.messages.length, 0);
  missions.update(2000);
  assert.equal(h.writes(), 2);
  assert.equal(h.messages.length, 1);
});

test('missions do not change points or round time and work without optional hooks or DOM', () => {
  const h = setup(false);
  const scene = { score: 42, runTime: 1200, level: 3 };
  const missions = new h.Missions(scene);
  for (let i = 0; i < 5; i++) missions.coin();
  for (let i = 0; i < 3; i++) missions.swordKill();
  missions.update(1200);
  assert.equal(missions.allComplete, true);
  assert.equal(scene.score, 42);
  assert.equal(scene.runTime, 1200);
  missions.destroy();
});
