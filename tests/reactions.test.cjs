const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(path.join(__dirname, '../features/reactions.js'), 'utf8');

class Element {
  constructor() {
    this.children = []; this.listeners = new Map(); this.styleWrites = 0;
    this.style = new Proxy({}, { set: (target, key, value) => { this.styleWrites++; target[key] = value; return true; } });
    this.attributes = {}; this.textContent = '';
  }
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
  const scene = { config: { width: 800, height: 500 }, paused: false, finished: false, runTime: 0, events: new EventEmitter() };
  const reactions = new root.CoinDashReactions(scene);
  return { reactions, scene, doc, synth, overlay, controls, create: () => new root.CoinDashReactions(scene) };
}

test('fast collection keeps the strict 2-second threshold and praises finite milestones only', () => {
  const { reactions: r } = setup();
  r.coin(0);
  assert.equal(r.quickChain, 1);
  r.coin(1999);
  assert.equal(r.captionText, '');
  r.coin(3998);
  assert.equal(r.captionText, 'P1: 3 quick coins! Coin vacuum: activated!');
  r.coin(5998);
  assert.equal(r.quickChain, 1);
  assert.equal(r.captionText, '');
  assert.equal(r.rewards.length, 1);
});

test('slow nudges start at 12 seconds with a 25-second global cooldown and one per gap', () => {
  const { reactions: r } = setup();
  const messages = [];
  const original = r.showCaption.bind(r);
  r.showCaption = text => { const shown = original(text); if (shown) messages.push(text); return shown; };
  r.update(11999);
  assert.equal(messages.length, 0);
  r.update(12000);
  assert.equal(messages[0], 'The coins are getting emotionally attached.');
  r.update(12001);
  r.update(12500);
  assert.equal(messages.length, 1);
  r.coin(13000);
  assert.equal(messages.length, 1);
  r.update(25000);
  r.update(36999);
  assert.equal(messages.length, 1);
  r.update(37000);
  assert.equal(messages[1], 'That coin has started a book club.');
  r.coin(38000);
  assert.equal(messages.length, 2);
});

test('successful collection never triggers an idle joke, even after a long gap', () => {
  const { reactions: r } = setup();
  r.coin(0);
  r.coin(12000);
  assert.equal(r.captionText, '');
  r.sarcasmEnabled = false;
  r.update(24000);
  assert.equal(r.captionText, '');
  assert.equal(r.slowIndex, 0);
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
  const writes = reward.styleWrites;
  r.update(500);
  assert.equal(reward.style.opacity, '1');
  assert.match(reward.style.transform, / - 0px/);
  assert.equal(reward.styleWrites, writes);
  assert.equal(overlay.children.length, 1);
  r.update(1100);
  assert.equal(r.rewards.length, 0);
  assert.equal(r.layer.children.includes(reward), false);
});

test('voice requires a trusted gesture, selects a local voice, rate-limits and never queues over speech', () => {
  const { reactions: r, doc, synth } = setup({ dom: true, speech: true });
  r.sarcasmEnabled = false;
  r.announce('Before gesture');
  doc.emit('pointerdown', { isTrusted: false });
  r.announce('Synthetic gesture');
  assert.equal(synth.spoken.length, 0);
  doc.emit('keydown', { isTrusted: true });
  r.update(3500);
  r.announce('Ready!');
  assert.equal(synth.spoken.length, 1);
  assert.equal(synth.spoken[0].voice.localService, true);
  r.update(17499);
  r.speak('Too soon');
  assert.equal(synth.spoken.length, 1);
  r.update(17500);
  r.announce('Still speaking');
  assert.equal(synth.spoken.length, 1);
  synth.end();
  r.announce('Now ready');
  assert.equal(synth.spoken.length, 1); // The busy callout is dropped, never queued.
  r.update(21000);
  r.announce('Now ready');
  assert.equal(synth.spoken.length, 2);
  synth.end();
  r.update(34999);
  r.speak('Too soon');
  assert.equal(synth.spoken.length, 2);
  r.update(35000);
  r.speak('Cooldown passed');
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
  r.update(3500);
  r.announce('Offline voice available');
  assert.equal(synth.spoken.length, 1);
  assert.equal(synth.spoken[0].lang, 'en-GB');
});

test('pause/gameover/destroy cancel owned speech, clean UI/listeners, and cannot restart effects', () => {
  const { reactions: r, scene, doc, synth, overlay, controls } = setup({ dom: true, speech: true });
  r.sarcasmEnabled = false;
  doc.emit('keydown', { isTrusted: true });
  r.announce('A message');
  r.setPaused(true);
  assert.equal(synth.cancelled, 1);
  r.setPaused(false);
  r.update(14000);
  r.announce('Another message');
  scene.finished = true;
  r.update(14100);
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

test('all announcements share exact caption boundaries and a 20-second text dedup window', () => {
  const { reactions: r } = setup();
  r.sarcasmEnabled = false;
  r.announce('Mission complete!');
  r.update(3499);
  r.announce('Near miss!');
  assert.equal(r.captionText, '');
  r.update(3500);
  r.announce('Near miss!');
  assert.equal(r.captionText, 'Near miss!');
  r.update(7000);
  r.announce('Mission complete!');
  assert.equal(r.captionText, '');
  r.update(19999);
  r.announce('Mission complete!');
  assert.equal(r.captionText, '');
  r.update(20000);
  r.announce('Mission complete!');
  assert.equal(r.captionText, 'Mission complete!');
});

test('hundreds of coins and mixed callouts preserve rewards with bounded captions, speech and DOM', () => {
  const { reactions: r, doc, synth } = setup({ dom: true, speech: true });
  doc.emit('pointerdown', { isTrusted: true });
  const captions = [];
  const original = r.showCaption.bind(r);
  r.showCaption = (text, tone) => {
    const shown = original(text, tone);
    if (shown) captions.push({ text, time: r.time });
    return shown;
  };
  let createdRewards = 0;
  const append = r.layer.appendChild.bind(r.layer);
  r.layer.appendChild = node => { if (node.className === 'reaction-reward') createdRewards++; return append(node); };
  for (let i = 0; i < 100; i++) {
    r.coin(i * 100, { points: i + 1, bonusSeconds: 3 });
    r.announce(`Mission ${i}`);
    r.announce(`Kill chain ${i}`);
    r.announce('Near miss!');
    synth.end();
    assert.ok(r.rewards.length <= 6);
    assert.ok(r.layer.children.length <= 7);
    assert.equal(r.rewards.at(-1).node.textContent, `+${i + 1} ${i ? 'points' : 'point'} · +3s`);
  }
  assert.equal(createdRewards, 100);
  assert.ok(captions.length <= 3);
  assert.equal(synth.spoken.length, 1);
  for (let i = 1; i < captions.length; i++) assert.ok(captions[i].time - captions[i - 1].time >= 3500);
  const writes = r.rewards.reduce((sum, reward) => sum + reward.node.styleWrites, 0);
  r.update(9900);
  assert.equal(r.rewards.reduce((sum, reward) => sum + reward.node.styleWrites, 0), writes);
  r.destroy();
  assert.equal(r.rewards.length, 0);
  assert.equal(r.recentCaptions.size, 0);
});

test('a long fast chain praises only milestones 3, 6 and 10, with varied lines', () => {
  const { reactions: r } = setup();
  const captions = [];
  const original = r.showCaption.bind(r);
  r.showCaption = text => { const shown = original(text); if (shown) captions.push(text); return shown; };
  for (let i = 0; i < 100; i++) r.coin(i * 1200);
  assert.equal(r.quickChain, 100);
  assert.equal(captions.length, 3);
  assert.equal(new Set(captions).size, 3);
  assert.match(captions[0], /3 quick coins/);
  assert.match(captions[1], /6 quick coins/);
  assert.match(captions[2], /10 quick coins/);
});

test('paused active time does not age caption or speech cooldowns', () => {
  const { reactions: r, doc, synth } = setup({ dom: true, speech: true });
  r.sarcasmEnabled = false;
  doc.emit('keydown', { isTrusted: true });
  r.announce('Coin vacuum ready');
  r.setPaused(true);
  r.update(50000);
  r.announce('Ignored');
  assert.equal(r.time, 0);
  r.setPaused(false);
  r.update(3499);
  r.announce('Still too soon');
  assert.equal(synth.spoken.length, 1);
  r.update(3500);
  r.announce('Caption is ready');
  assert.equal(r.captionText, 'Caption is ready');
  assert.equal(synth.spoken.length, 1);
  r.update(14000);
  r.announce('Voice is ready');
  assert.equal(synth.spoken.length, 2);
});

test('voice and playful-nudge controls remain independent and silence their own feedback', () => {
  const { reactions: r, doc, synth } = setup({ dom: true, speech: true });
  doc.emit('keydown', { isTrusted: true });
  r.announce('Pocket party!');
  const voiceToggle = r.controls.children[0].children[0];
  const nudgeToggle = r.controls.children[1].children[0];
  voiceToggle.checked = false;
  voiceToggle.emit('change');
  nudgeToggle.checked = false;
  nudgeToggle.emit('change');
  assert.equal(synth.cancelled, 1);
  r.update(14000);
  r.announce('Captions still work');
  assert.equal(r.captionText, 'Captions still work');
  assert.equal(synth.spoken.length, 1);
  r.update(40000);
  assert.equal(r.slowIndex, 0);
  assert.equal(r.captionText, '');
  r.destroy();
  assert.equal(voiceToggle.listenerCount(), 0);
  assert.equal(nudgeToggle.listenerCount(), 0);
});

function emitAt(scene, name, time, details = {}) {
  scene.runTime = time;
  scene.events.emit(name, { runnerId: 'p1', time, ...details });
}

test('fast coins earn praise, misses and damage reset it, and recovery starts from one', () => {
  const { reactions: r, scene, doc, synth } = setup({ dom: true, speech: true });
  doc.emit('pointerdown', { isTrusted: true });
  for (const time of [0, 500, 1000]) r.coin(time, { runnerId: 'p1' });
  assert.equal(r.quickChain, 3);
  assert.match(r.captionText, /P1: 3 quick coins/);
  assert.equal(synth.spoken.length, 1);
  const rewards = r.rewards.length;
  emitAt(scene, 'strike-missed', 1100);
  assert.equal(r.quickChain, 0);
  assert.equal(r.lastCoinTime, null);
  assert.equal(r.captionText, '');
  assert.equal(r.caption.hidden, true);
  assert.equal(synth.cancelled, 1);
  assert.equal(r.rewards.length, rewards); // Failure never removes factual rewards.
  r.coin(1200);
  assert.equal(r.quickChain, 1);
  assert.equal(r.captionText, '');
  for (const time of [5000, 5500, 6000]) r.coin(time);
  assert.equal(r.quickChain, 3);
  assert.match(r.captionText, /P1: 3 quick coins/);
  assert.equal(synth.spoken.length, 1); // Failure does not bypass the voice cooldown.
  scene.runTime = 6100;
  scene.events.emit('player-hit', { runnerId: 'p1', damaged: true });
  assert.equal(r.time, 6100); // A hit before update uses the scene's active clock.
  assert.equal(r.quickChain, 0);
  assert.equal(r.captionText, '');
  r.coin(6200);
  assert.equal(r.quickChain, 1);
});

test('alternating players cannot manufacture a coin streak and one failure leaves the other praise intact', () => {
  const { reactions: r, scene, doc, synth } = setup({ dom: true, speech: true });
  doc.emit('keydown', { isTrusted: true });
  r.coin(0, { runnerId: 'p1' });
  r.coin(1000, { runnerId: 'p2' });
  r.coin(2000, { runnerId: 'p1' });
  r.coin(3000, { runnerId: 'p2' });
  assert.equal(r.captionText, '');
  assert.equal(r.performance.get('p1').coinCount, 1);
  assert.equal(r.performance.get('p2').coinCount, 1);
  r.coin(3100, { runnerId: 'p2' });
  r.coin(3200, { runnerId: 'p2' });
  const praise = r.captionText;
  assert.match(praise, /P2: 3 quick coins/);
  emitAt(scene, 'strike-missed', 3300, { runnerId: 'p1' });
  emitAt(scene, 'player-hit', 3400, { runnerId: 'p2', damaged: false });
  assert.equal(r.captionText, praise);
  assert.equal(synth.cancelled, 0);
  assert.equal(r.performance.get('p2').coinCount, 3);
  emitAt(scene, 'player-hit', 3500, { runnerId: 'p2', damaged: true });
  assert.equal(r.captionText, '');
  assert.equal(synth.cancelled, 1);
  assert.equal(r.performance.get('p2').coinCount, 0);
});

test('coin gaps expire on update at exactly two seconds and cancel obsolete spoken praise', () => {
  const { reactions: r, doc, synth } = setup({ dom: true, speech: true });
  doc.emit('keydown', { isTrusted: true });
  for (const time of [0, 500, 1000]) r.coin(time);
  r.update(2999);
  assert.equal(r.quickChain, 3);
  assert.match(r.captionText, /quick coins/);
  assert.equal(synth.cancelled, 0);
  r.update(3000);
  assert.equal(r.quickChain, 0);
  assert.equal(r.lastCoinTime, null);
  assert.equal(r.captionText, '');
  assert.equal(synth.cancelled, 1);
  r.coin(3001);
  assert.equal(r.quickChain, 1);
  assert.equal(r.captionText, '');
});

test('only authoritative kill counts trigger 2/3/5 praise, never attempts or every kill', () => {
  const { reactions: r, scene } = setup();
  const requested = [];
  const show = r.showCaption.bind(r);
  r.showCaption = (...args) => { requested.push(args[0]); return show(...args); };
  for (let i = 0; i < 10; i++) emitAt(scene, 'player-dash', i * 20);
  assert.equal(requested.length, 0);
  for (const [time, count] of [[0, 1], [1000, 2], [2000, 3], [3000, 4], [4500, 5], [5000, 6]]) {
    emitAt(scene, 'enemy-killed', time, { count, cause: count % 2 ? 'enemy' : 'shot' });
  }
  assert.equal(requested.length, 3);
  assert.match(requested[0], /P1: 2 kill chain/);
  assert.match(requested[1], /P1: 3 kill chain/);
  assert.match(requested[2], /P1: 5 kill chain/);
  assert.match(r.captionText, /5 kill chain/);
  assert.equal(r.performance.get('p1').killCount, 6);
  assert.equal(r.quickChain, 0);
  assert.equal(r.rewards.length, 0); // Kills never invent a +3s coin reward.
  emitAt(scene, 'enemy-killed', 5000, { count: 6, cause: 'enemy' });
  emitAt(scene, 'enemy-killed', 5100, { count: 10, cause: 'attempt' });
  emitAt(scene, 'enemy-killed', 5200, { count: 0, cause: 'enemy' });
  assert.equal(r.performance.get('p1').killCount, 6);
  assert.equal(r.lastSuccessTime, 5000);
  emitAt(scene, 'strike-missed', 5300);
  assert.equal(r.performance.get('p1').killCount, 0);
  assert.equal(r.captionText, '');
  emitAt(scene, 'enemy-killed', 5400, { count: 1, cause: 'enemy' });
  assert.equal(r.captionText, '');
});

test('kill gap expiry cancels a lingering owned voice even after its caption has faded', () => {
  const { reactions: r, scene, doc, synth } = setup({ dom: true, speech: true });
  doc.emit('keydown', { isTrusted: true });
  emitAt(scene, 'enemy-killed', 0, { count: 1, cause: 'enemy' });
  emitAt(scene, 'enemy-killed', 100, { count: 2, cause: 'enemy' });
  assert.match(r.captionText, /2 kill chain/);
  r.update(2400);
  assert.equal(r.captionText, '');
  assert.equal(synth.cancelled, 0);
  r.update(2599);
  assert.equal(r.performance.get('p1').killCount, 2);
  r.update(2600);
  assert.equal(r.performance.get('p1').killCount, 0);
  assert.equal(synth.cancelled, 1);
});

test('returning coins or kills clear idle jokes immediately and restart the global idle clock', () => {
  const { reactions: r, scene, doc, synth } = setup({ dom: true, speech: true });
  doc.emit('keydown', { isTrusted: true });
  r.update(12000);
  assert.equal(r.captionMeta.kind, 'idle');
  r.coin(12100, { runnerId: 'p2' });
  assert.equal(r.captionText, '');
  assert.equal(synth.cancelled, 1);
  emitAt(scene, 'enemy-killed', 23000, { count: 1, cause: 'shot', runnerId: 'p1' });
  r.update(35000);
  assert.equal(r.captionText, ''); // Idle threshold met, but the 25s nudge cooldown remains.
  r.update(37000);
  assert.equal(r.captionMeta.kind, 'idle');
  assert.equal(synth.spoken.length, 2);
  emitAt(scene, 'enemy-killed', 37100, { count: 1, cause: 'enemy', runnerId: 'p2' });
  assert.equal(r.captionText, '');
  assert.equal(synth.cancelled, 2);
  assert.equal(r.lastSuccessTime, 37100);
  r.update(49099);
  assert.equal(r.slowIndex, 2);
});

test('failure preserves factual announcements and never cancels unrelated browser speech', () => {
  const { reactions: r, scene, doc, synth } = setup({ dom: true, speech: true });
  doc.emit('keydown', { isTrusted: true });
  r.announce('Sword goal complete: 3 kills');
  emitAt(scene, 'player-hit', 100, { damaged: true });
  assert.equal(r.captionText, 'Sword goal complete: 3 kills');
  assert.equal(synth.cancelled, 0);
  synth.end();
  synth.speaking = true; // A different browser feature owns this utterance.
  for (const time of [4000, 4500, 5000]) r.coin(time);
  assert.match(r.captionText, /quick coins/);
  emitAt(scene, 'strike-missed', 5100);
  assert.equal(r.captionText, '');
  assert.equal(synth.cancelled, 0);
});

test('pause ignores performance events and preserves streak time, while restart drops state and listeners', () => {
  const { reactions: r, scene, create } = setup();
  r.coin(0);
  r.coin(500);
  r.setPaused(true);
  emitAt(scene, 'strike-missed', 50000);
  emitAt(scene, 'enemy-killed', 50001, { cause: 'enemy', count: 5 });
  r.update(50002);
  assert.equal(r.time, 500);
  assert.equal(r.quickChain, 2);
  r.setPaused(false);
  r.coin(1000);
  assert.equal(r.quickChain, 3);
  assert.match(r.captionText, /3 quick coins/);
  const otherListener = () => {};
  scene.events.on('enemy-killed', otherListener);
  r.destroy();
  assert.equal(scene.events.listenerCount('enemy-killed'), 1);
  assert.equal(scene.events.listenerCount('strike-missed'), 0);
  assert.equal(scene.events.listenerCount('player-hit'), 0);
  assert.equal(r.performance.size, 0);
  scene.runTime = 0;
  const restarted = create();
  assert.equal(restarted.quickChain, 0);
  assert.equal(restarted.captionText, '');
  restarted.coin(0);
  assert.equal(restarted.quickChain, 1);
  scene.finished = true;
  emitAt(scene, 'enemy-killed', 100, { cause: 'enemy', count: 5 });
  restarted.update(100);
  assert.equal(restarted.captionText, '');
  assert.equal(restarted.performance.size, 0);
  restarted.destroy();
  assert.equal(scene.events.listenerCount('enemy-killed'), 1);
});
