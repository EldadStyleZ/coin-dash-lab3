const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../features/reactions.js'), 'utf8');

class Element {
  constructor() { this.children = []; this.listeners = new Map(); this.style = {}; this.attributes = {}; this.textContent = ''; }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  emit(name, event) { this.listeners.get(name)?.forEach(fn => fn(event)); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 250 }; }
  listenerCount() { return [...this.listeners.values()].reduce((count, set) => count + set.size, 0); }
}

function setup({ dom = false, speech = false, reducedMotion = false, voices } = {}) {
  const root = {};
  const overlay = new Element();
  const controls = new Element();
  let doc;
  if (dom) {
    doc = new Element();
    doc.getElementById = id => id === 'reaction-overlay' ? overlay : id === 'reaction-controls' ? controls : null;
    doc.createElement = () => new Element();
    doc.createTextNode = text => Object.assign(new Element(), { textContent: text });
    root.document = doc;
  }
  let synth;
  if (speech) {
    synth = new Element();
    synth.voices = voices || [{ lang: 'en-US', localService: true, name: 'Local English' }];
    synth.getVoices = () => synth.voices;
    synth.spoken = [];
    synth.cancelled = 0;
    synth.speak = utterance => { synth.spoken.push(utterance); synth.speaking = true; };
    synth.end = () => { synth.speaking = false; synth.spoken.at(-1)?.onend?.(); };
    synth.cancel = () => { synth.cancelled++; synth.speaking = false; };
    root.speechSynthesis = synth;
    root.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  }
  root.matchMedia = () => ({ matches: reducedMotion });
  vm.runInNewContext(source, { window: root });
  const scene = { config: { width: 800, height: 500 }, paused: false, finished: false };
  const reactions = new root.CoinDashReactions(scene);
  return { reactions, scene, doc, synth, overlay, controls };
}

test('fast collection uses a strict 2-second threshold and three coins form a super chain', () => {
  const { reactions: r } = setup();
  r.coin(0);
  assert.equal(r.quickChain, 1);
  r.coin(1999);
  assert.equal(r.captionText, 'WOW!');
  r.coin(3998);
  assert.equal(r.captionText, 'YOU SUPER!');
  r.coin(5998);
  assert.equal(r.quickChain, 1);
  assert.equal(r.rewards.length, 1);
});

test('slow nudges happen at 8 seconds and only once per gap, even on a late collection', () => {
  const { reactions: r } = setup();
  const messages = [];
  const original = r.showCaption.bind(r);
  r.showCaption = text => { messages.push(text); original(text); };
  r.update(7999);
  assert.equal(messages.length, 0);
  r.update(8000);
  assert.equal(messages[0], 'Are you awake?');
  r.update(8001);
  r.update(16000);
  assert.equal(messages.length, 1);
  r.coin(17000);
  assert.equal(messages.length, 1);
  r.update(24999);
  assert.equal(messages.length, 1);
  r.update(25000);
  assert.equal(messages[1], "The coins aren't going to collect themselves.");
  r.coin(26000);
  assert.equal(messages.length, 2);
});

test('a collection after a long gap also nudges when no update crossed the threshold', () => {
  const { reactions: r } = setup();
  r.coin(0);
  r.coin(8000);
  assert.equal(r.captionText, 'Are you awake?');
  r.sarcasmEnabled = false;
  r.update(16000);
  assert.equal(r.captionText, '');
  assert.equal(r.slowIndex, 1);
});

test('pause freezes rewards and captions, rejects coins, and resumes using active time', () => {
  const { reactions: r } = setup();
  r.coin(0);
  r.announce('Mission complete!');
  r.setPaused(true);
  r.update(10000);
  r.coin(10000);
  assert.equal(r.time, 0);
  assert.equal(r.rewards.length, 1);
  assert.equal(r.captionText, 'Mission complete!');
  r.setPaused(false);
  r.update(1100);
  assert.equal(r.rewards.length, 0);
  r.update(2300);
  assert.equal(r.captionText, '');
});

test('every coin displays points and time near its position; reduced motion stays static', () => {
  const { reactions: r, overlay } = setup({ dom: true, reducedMotion: true });
  r.coin(0, { points: 3, bonusSeconds: 3, x: 200, y: 250 });
  const reward = r.rewards[0].node;
  assert.equal(reward.textContent, '+3 points · +3s');
  assert.equal(reward.style.left, '25%');
  assert.equal(reward.style.top, '50%');
  r.update(500);
  assert.equal(reward.style.opacity, '1');
  assert.match(reward.style.transform, / - 0px/);
  assert.equal(overlay.children.length, 1);
  r.update(1100);
  assert.equal(r.rewards.length, 0);
  assert.equal(r.layer.children.includes(reward), false);
});

test('voice requires a trusted gesture, selects a local voice, rate-limits and never queues over speech', () => {
  const { reactions: r, doc, synth } = setup({ dom: true, speech: true });
  r.announce('Before gesture');
  doc.emit('pointerdown', { isTrusted: false });
  r.announce('Synthetic gesture');
  assert.equal(synth.spoken.length, 0);
  doc.emit('keydown', { isTrusted: true });
  r.announce('Ready!');
  assert.equal(synth.spoken.length, 1);
  assert.equal(synth.spoken[0].voice.localService, true);
  r.update(6000);
  r.announce('Still speaking');
  assert.equal(synth.spoken.length, 1);
  synth.end();
  r.announce('Now ready');
  assert.equal(synth.spoken.length, 2);
  synth.end();
  r.update(11999);
  r.announce('Too soon');
  assert.equal(synth.spoken.length, 2);
  r.update(12000);
  r.announce('Cooldown passed');
  assert.equal(synth.spoken.length, 3);
});

test('online voices are rejected and asynchronously arriving local voices work', () => {
  const { reactions: r, doc, synth } = setup({ dom: true, speech: true, voices: [{ lang: 'en-US', localService: false }] });
  doc.emit('pointerdown', { isTrusted: true });
  r.announce('Captions only');
  assert.equal(synth.spoken.length, 0);
  assert.match(r.voiceStatus.textContent, /no local voice/);
  synth.voices.push({ lang: 'en-GB', localService: true });
  synth.emit('voiceschanged', {});
  r.announce('Offline voice available');
  assert.equal(synth.spoken.length, 1);
  assert.equal(synth.spoken[0].lang, 'en-GB');
});

test('pause/gameover/destroy cancel owned speech, clean UI/listeners, and cannot restart effects', () => {
  const { reactions: r, scene, doc, synth, overlay, controls } = setup({ dom: true, speech: true });
  doc.emit('keydown', { isTrusted: true });
  r.announce('A message');
  r.setPaused(true);
  assert.equal(synth.cancelled, 1);
  r.setPaused(false);
  r.update(6000);
  r.announce('Another message');
  scene.finished = true;
  r.update(6100);
  assert.equal(synth.cancelled, 2);
  assert.equal(r.layer.hidden, true);
  r.destroy();
  r.destroy();
  assert.equal(doc.listenerCount(), 0);
  assert.equal(synth.listenerCount(), 0);
  assert.equal(overlay.children.length, 0);
  assert.equal(controls.children.length, 0);
  r.coin(10000);
  r.announce('After destroy');
  assert.equal(r.rewards.length, 0);
  assert.equal(synth.spoken.length, 2);
});

test('destroy does not cancel unrelated speech and invalid time cannot change state', () => {
  const { reactions: r, synth } = setup({ dom: true, speech: true });
  synth.speaking = true;
  r.coin(200);
  for (const time of [NaN, Infinity, -1, 100]) r.coin(time);
  assert.equal(r.time, 200);
  assert.equal(r.quickChain, 1);
  r.destroy();
  assert.equal(synth.cancelled, 0);
});
