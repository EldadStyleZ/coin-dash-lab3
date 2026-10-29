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
  let currentContext = null;
  let intervalId = 0;
  const element = () => ({ children: [], listeners: new Map(),
    append(...children) { this.children.push(...children); },
    replaceChildren() { this.children = []; },
    setAttribute() {},
    addEventListener(name, fn) { this.listeners.set(name, fn); },
    removeEventListener(name) { this.listeners.delete(name); },
    emit(name) { this.listeners.get(name)?.(); }
  });
  const container = element();
  const document = {
    getElementById() { return container; },
    createElement: element,
    createTextNode(text) { return { textContent: text }; },
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); }
  };
  const parameter = () => ({ value: 0, values: [],
    setValueAtTime(value) { this.values.push(value); },
    linearRampToValueAtTime(value) { this.values.push(value); },
    exponentialRampToValueAtTime(value) { this.values.push(value); }, setTargetAtTime() {} });
  class Context {
    constructor() { contexts++; currentContext = this; this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 44100; this.destination = {}; }
    async resume() { this.state = 'running'; }
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; }
    createBiquadFilter() { return { frequency: parameter(), Q: parameter(), connect() {}, disconnect() {} }; }
    createBuffer(_channels, count) { const data = new Float32Array(count); return { getChannelData() { return data; } }; }
    createBufferSource() { return this.createOscillator(); }
    createOscillator() {
      const node = { frequency: parameter(), connect() {}, disconnect() { this.disconnected = true; }, start() {},
        stop(at) { this.stopAt = at; }, onended: null };
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
    setTime(ms, endNotes = true) {
      currentContext.currentTime = ms / 1000;
      if (endNotes) oscillators.forEach(node => {
        if (node.stopAt <= currentContext.currentTime) node.onended?.();
      });
    },
    toggle(index, checked) {
      const input = container.children[index].children[0];
      input.checked = checked; input.emit('change');
    },
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


test('samurai slice and shot effects use shared context and release on pause', async () => {
  const h = harness();
  const audio = h.audio.create();
  await h.gesture();
  const before = h.oscillators.length;
  audio.play('shot');
  audio.play('slice');
  audio.play('whiff');
  assert.equal(h.oscillators.length - before, 6); // shot + slice noise/two metallic partials + miss noise/soft boing
  assert.ok(h.oscillators.some(node => node.frequency.values.includes(3150)));
  assert.ok(h.oscillators.some(node => node.frequency.values.includes(4730)));
  assert.ok(h.oscillators.some(node => node.type === 'triangle' && node.frequency.values.includes(85)));
  assert.equal(h.contexts(), 1);
  audio.setPaused(true);
  assert.ok(h.oscillators.every(node => node.disconnected));
  const stopped = h.oscillators.length;
  audio.play('slice');
  assert.equal(h.oscillators.length, stopped);
  audio.destroy();
});

test('a hundred coins and combat calls cannot stack effects beyond eight sources', async () => {
  const h = harness();
  const audio = h.audio.create();
  await h.gesture();
  h.toggle(0, false); // Inspect effects without the independent music notes.
  const before = h.oscillators.length;
  for (let i = 0; i < 100; i++) {
    for (const action of ['coin', 'slice', 'shot', 'whiff']) audio.play(action);
  }
  assert.equal(h.oscillators.length - before, 8);
  for (let i = 1; i <= 100; i++) {
    h.setTime(i * 250, false); // Even delayed onended delivery cannot grow the graph.
    for (const action of ['coin', 'slice', 'shot', 'whiff', 'hit', 'angry']) audio.play(action);
    assert.ok(h.oscillators.filter(node => !node.disconnected).length <= 8);
  }
  audio.destroy();
  assert.ok(h.oscillators.every(node => node.disconnected));
});

test('coin, shot and slice accept exact cooldown boundaries without replaying rejected sounds', async () => {
  for (const [action, cooldown, cost] of [['coin', 100, 2], ['shot', 100, 1], ['slice', 125, 3]]) {
    const h = harness();
    const audio = h.audio.create();
    await h.gesture();
    h.toggle(0, false);
    const before = h.oscillators.length;
    audio.play(action);
    h.setTime(cooldown - 1);
    audio.play(action);
    assert.equal(h.oscillators.length - before, cost);
    h.setTime(cooldown);
    audio.play(action);
    assert.equal(h.oscillators.length - before, cost * 2);
    audio.destroy();
  }
});

test('effect cooldowns use scene active time, so pause cannot spend the cooldown', async () => {
  const h = harness();
  const scene = { runTime: 0 };
  const audio = h.audio.create(scene);
  await h.gesture();
  h.toggle(0, false);
  audio.play('slice');
  audio.setPaused(true);
  const before = h.oscillators.length;
  h.setTime(10000);
  audio.play('slice');
  audio.setPaused(false);
  scene.runTime = 124;
  audio.play('slice');
  assert.equal(h.oscillators.length, before);
  scene.runTime = 125;
  audio.play('slice');
  assert.equal(h.oscillators.length, before + 3);
  audio.destroy();
});

test('level and game-over jingles preempt a full effects graph and remain protected from spam', async () => {
  const h = harness();
  const audio = h.audio.create();
  await h.gesture();
  h.toggle(0, false);
  for (const action of ['slice', 'whiff', 'coin', 'shot']) audio.play(action);
  assert.equal(h.oscillators.filter(node => !node.disconnected).length, 8);
  const before = h.oscillators.length;
  audio.play('level');
  assert.equal(h.oscillators.length, before + 4);
  assert.equal(h.oscillators.filter(node => !node.disconnected).length, 4);
  for (let i = 0; i < 100; i++) { audio.play('slice'); audio.play('coin'); audio.play('level'); }
  assert.equal(h.oscillators.length, before + 4);
  audio.play('gameover');
  audio.setPaused(true);
  assert.equal(h.oscillators.length, before + 8);
  assert.equal(h.oscillators.filter(node => !node.disconnected).length, 4);
  for (let i = 0; i < 100; i++) { audio.play('gameover'); audio.play('level'); }
  assert.equal(h.oscillators.length, before + 8);
  audio.destroy();
});

test('sound mute releases effects and prevents even priority jingles; coin pitches vary softly', async () => {
  const h = harness();
  const audio = h.audio.create();
  await h.gesture();
  h.toggle(0, false);
  audio.play('coin');
  const first = h.oscillators.at(-2).frequency.values[0];
  h.setTime(200);
  audio.play('coin');
  assert.notEqual(h.oscillators.at(-2).frequency.values[0], first);
  h.toggle(1, false);
  assert.ok(h.oscillators.every(node => node.disconnected));
  const before = h.oscillators.length;
  for (const action of ['coin', 'whiff', 'level', 'gameover']) audio.play(action);
  assert.equal(h.oscillators.length, before);
  audio.destroy();
});
