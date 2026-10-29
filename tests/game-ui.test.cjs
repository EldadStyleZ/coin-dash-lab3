const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function fixture(paused = false) {
  const nodes = new Map();
  const doc = { getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, { open: false, listeners: {}, attrs: {}, focuses: 0,
      addEventListener(type, callback) { this.listeners[type] = callback; },
      setAttribute(key, value) { this.attrs[key] = value; },
      focus(options) { assert.equal(options.preventScroll, true); this.focuses++; },
      showModal() { this.open = true; }, close() { this.open = false; }
    });
    return nodes.get(id);
  } };
  const root = { document: doc };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../features/game-ui.js'), 'utf8'), { window: root });
  const scene = { paused, finished: false, changes: [], setPaused(value) { this.paused = value; this.changes.push(value); } };
  const ui = new root.CoinDashGameUI(() => scene);
  return { ui, scene, nodes, UI: root.CoinDashGameUI };
}
test('settings pauses active play and closes back to the focused arena once', () => {
  const { ui, scene, nodes } = fixture();
  ui.open(); ui.open();
  assert.equal(scene.paused, true); assert.equal(ui.isOpen(), true);
  assert.equal(nodes.get('settings-toggle').attrs['aria-expanded'], 'true');
  ui.close(); nodes.get('settings-dialog').listeners.close();
  assert.deepEqual(scene.changes, [true, false]);
  assert.equal(nodes.get('settings-toggle').attrs['aria-expanded'], 'false');
  assert.ok(nodes.get('game').focuses > 0);
});
test('closing settings keeps a previously paused round paused', () => {
  const { ui, scene } = fixture(true);
  ui.open(); ui.close();
  assert.equal(scene.paused, true);
  assert.deepEqual(scene.changes, [true]);
});
test('apply and new round closes without briefly resuming the old round', () => {
  const { ui, scene, nodes } = fixture();
  ui.open(); ui.close(false); nodes.get('settings-dialog').listeners.close();
  assert.deepEqual(scene.changes, [true]);
});
test('Escape closes through the same pause-safe dialog lifecycle', () => {
  const { ui, scene, nodes } = fixture();
  ui.open(); let prevented = false;
  nodes.get('settings-dialog').listeners.cancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(ui.isOpen(), false); assert.equal(scene.paused, false);
});
test('a delayed close event cannot resume a newly reopened settings dialog', () => {
  const { ui, scene, nodes } = fixture();
  ui.open(); ui.close(); ui.open(); nodes.get('settings-dialog').listeners.close();
  assert.equal(scene.paused, true);
  assert.equal(nodes.get('settings-toggle').attrs['aria-expanded'], 'true');
});
test('Space repeats and arrows are prevented even when the page body has focus', () => {
  const { UI } = fixture();
  for (const key of [' ', 'Spacebar', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
    assert.equal(UI.preventsPageScroll({ key, repeat: true, target: { closest: () => null } }, false), true);
  }
  assert.equal(UI.preventsPageScroll({ key: 'f' }, false), false);
});
test('settings retain native keyboard behavior and browser shortcuts', () => {
  const { UI } = fixture();
  assert.equal(UI.preventsPageScroll({ key: 'ArrowDown' }, true), false);
  assert.equal(UI.preventsPageScroll({ key: ' ', target: { closest: () => ({}) } }, false), false);
  assert.equal(UI.preventsPageScroll({ key: ' ', target: { isContentEditable: true } }, false), false);
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) assert.equal(UI.preventsPageScroll({ key: ' ', [modifier]: true }, false), false);
});
