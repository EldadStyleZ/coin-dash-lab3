const test = require('node:test');
const assert = require('node:assert/strict');
const CoinDashTouchControls = require('../features/controls.js');

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, properties = {}) {
    const event = { type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...properties };
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
    return event;
  }
  listenerCount() { return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0); }
}
class Element extends Target {
  constructor(document) { super(); this.ownerDocument = document; this.children = []; this.attributes = {}; this.captures = new Set(); }
  appendChild(child) { this.children.push(child); child.parent = this; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(name, value) { this.attributes[name] = value; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); this.emit('lostpointercapture', { pointerId: id }); }
}
function setup() {
  const window = new Target();
  const document = new Target();
  document.defaultView = window;
  document.createElement = () => new Element(document);
  const container = new Element(document);
  let strikes = 0;
  const controls = new CoinDashTouchControls({ container, onStrike: () => strikes++ });
  return { controls, container, document, window, get strikes() { return strikes; } };
}
function press(button, id) { return button.emit('pointerdown', { pointerId: id, button: 0 }); }

test('independent pointers combine diagonally; cancel and outside release stop movement', () => {
  const { controls, window } = setup();
  const up = controls.buttons.get('up'), right = controls.buttons.get('right');
  assert.equal(press(up, 1).defaultPrevented, true);
  press(right, 2);
  assert.deepEqual(controls.direction(), { x: 1, y: -1 });
  up.emit('pointercancel', { pointerId: 1 });
  assert.deepEqual(controls.direction(), { x: 1, y: 0 });
  window.emit('pointerup', { pointerId: 2 });
  assert.deepEqual(controls.direction(), { x: 0, y: 0 });
  assert.equal(up.attributes['aria-pressed'], 'false');
  assert.equal(right.captures.size, 0);
});

test('two pointers on one direction stay held until both release; opposing directions cancel', () => {
  const { controls } = setup();
  const left = controls.buttons.get('left'), right = controls.buttons.get('right');
  press(left, 1); press(left, 2); press(right, 3);
  assert.deepEqual(controls.direction(), { x: 0, y: 0 });
  left.emit('pointerup', { pointerId: 1 });
  right.emit('lostpointercapture', { pointerId: 3 });
  assert.deepEqual(controls.direction(), { x: -1, y: 0 });
  left.emit('pointerup', { pointerId: 2 });
  assert.deepEqual(controls.direction(), { x: 0, y: 0 });
});

test('Space/Enter hold directions, ignore repeats and release after focus changes', () => {
  const { controls, window } = setup();
  const down = controls.buttons.get('down');
  down.emit('keydown', { code: 'Space' });
  down.emit('keydown', { code: 'Space', repeat: true });
  assert.deepEqual(controls.direction(), { x: 0, y: 1 });
  window.emit('keyup', { code: 'Space' });
  assert.deepEqual(controls.direction(), { x: 0, y: 0 });
  down.emit('keydown', { key: 'Enter' });
  down.emit('blur');
  assert.deepEqual(controls.direction(), { x: 0, y: 0 });
});

test('strike fires once per press, repeated keydown is ignored and touch plus keyboard coexist', () => {
  const state = setup();
  const strike = state.controls.buttons.get('strike'), up = state.controls.buttons.get('up');
  press(up, 1); press(strike, 2);
  strike.emit('pointerup', { pointerId: 2 });
  strike.emit('click', { detail: 1 });
  strike.emit('keydown', { code: 'Space' });
  strike.emit('keydown', { code: 'Space', repeat: true });
  assert.equal(state.strikes, 2);
  assert.deepEqual(state.controls.direction(), { x: 0, y: -1 });
  strike.emit('keyup', { code: 'Space' });
  strike.emit('click', { detail: 0 });
  assert.equal(state.strikes, 3);
});

test('blur and hidden page reset all pointers and keys, including pointer capture', () => {
  const { controls, window, document } = setup();
  const left = controls.buttons.get('left');
  press(left, 10);
  window.emit('blur');
  assert.deepEqual(controls.direction(), { x: 0, y: 0 });
  assert.equal(left.captures.size, 0);
  left.emit('keydown', { key: 'Enter' });
  document.hidden = true;
  document.emit('visibilitychange');
  assert.deepEqual(controls.direction(), { x: 0, y: 0 });
});

test('destroy is idempotent, removes its DOM/listeners and prevents old callbacks', () => {
  const state = setup();
  const buttons = [...state.controls.buttons.values()];
  press(buttons[0], 1);
  state.controls.destroy();
  state.controls.destroy();
  assert.equal(state.container.children.length, 0);
  assert.equal(state.window.listenerCount(), 0);
  assert.equal(state.document.listenerCount(), 0);
  buttons.forEach(button => assert.equal(button.listenerCount(), 0));
  press(buttons[4], 9);
  assert.equal(state.strikes, 0);
  assert.deepEqual(state.controls.direction(), { x: 0, y: 0 });
});

test('missing container is a harmless no-op and non-primary mouse buttons do not move', () => {
  const empty = new CoinDashTouchControls();
  assert.deepEqual(empty.direction(), { x: 0, y: 0 });
  empty.reset(); empty.destroy();
  const { controls } = setup();
  controls.buttons.get('up').emit('pointerdown', { pointerId: 1, button: 2 });
  assert.deepEqual(controls.direction(), { x: 0, y: 0 });
});
