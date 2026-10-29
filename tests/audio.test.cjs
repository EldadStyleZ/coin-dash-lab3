const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../features/audio.js'), 'utf8');

function harness(supported = true) {
  const listeners = new Map();
  const intervals = new Map();
  const oscillators = [];
  let contexts = 0;
  let intervalId = 0;
  const document = {
    getElementById() { return null; },
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); }
  };
  const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  class Context {
    constructor() { contexts++; this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    async resume() { this.state = 'running'; }
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; }
    createOscillator() {
      const node = { frequency: parameter(), connect() {}, disconnect() { this.disconnected = true; }, start() {}, stop() {}, onended: null };
      oscillators.push(node);
      return node;
    }
  }
  const window = {
    document,
    setInterval(callback) { intervals.set(++intervalId, callback); return intervalId; },
    clearInterval(id) { intervals.delete(id); }
  };
  if (supported) window.AudioContext = Context;
  vm.runInNewContext(source, { window });
  return {
    audio: window.CoinDashAudio,
    contexts: () => contexts,
    intervals, oscillators, listeners,
    async gesture() { await Promise.all([...listeners.get('pointerdown') || []].map(fn => fn({ isTrusted: true }))); }
  };
}

test('initial game creates no context or audio until a user gesture', async () => {
  const h = harness();
  const audio = h.audio.create();
  audio.play('coin');
  assert.equal(h.contexts(), 0);
  assert.equal(h.intervals.size, 0);
  await h.gesture();
  assert.equal(h.contexts(), 1);
  assert.equal(h.intervals.size, 1);
  assert.ok(h.oscillators.length > 0);
  audio.destroy();
});

test('restart reuses context and destroy releases nodes, timers and listeners', async () => {
  const h = harness();
  const audio = h.audio.create();
  await h.gesture();
  audio.play('coin');
  audio.destroy();
  audio.destroy();
  assert.equal(h.intervals.size, 0);
  assert.ok(h.oscillators.every(node => node.disconnected && node.onended === null));
  assert.ok([...h.listeners.values()].every(set => set.size === 0));
  const restart = h.audio.create();
  assert.equal(h.contexts(), 1);
  assert.equal(h.intervals.size, 1);
  restart.destroy();
});

test('pause silences current notes and resumes only one music loop', async () => {
  const h = harness();
  const audio = h.audio.create();
  await h.gesture();
  audio.play('hit');
  audio.setPaused(true);
  assert.equal(h.intervals.size, 0);
  assert.ok(h.oscillators.every(node => node.disconnected));
  const count = h.oscillators.length;
  audio.play('coin');
  assert.equal(h.oscillators.length, count);
  audio.setPaused(false);
  audio.setPaused(false);
  assert.equal(h.intervals.size, 1);
  audio.destroy();
});

test('game over stops music and preserves the final jingle when core pauses', async () => {
  const h = harness();
  const audio = h.audio.create();
  await h.gesture();
  audio.play('gameover');
  audio.setPaused(true);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.oscillators.filter(node => !node.disconnected).length, 4);
  audio.setPaused(false);
  assert.equal(h.intervals.size, 0);
  audio.destroy();
});

test('missing Web Audio does not block gameplay or create timers', () => {
  const h = harness(false);
  const audio = h.audio.create();
  for (const action of ['coin', 'hit', 'level', 'gameover']) audio.play(action);
  audio.setPaused(true);
  audio.setPaused(false);
  audio.destroy();
  assert.equal(h.contexts(), 0);
  assert.equal(h.intervals.size, 0);
});
