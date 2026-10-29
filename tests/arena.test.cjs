const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../features/arena.js'), 'utf8');

function setup() {
  const game = { style: { borderColor: '#123456' } };
  const window = { document: { getElementById() { return game; } } };
  vm.runInNewContext(source, { window });
  const objects = [];
  const colliders = [];
  const scene = { level: 1 };
  function shape(x, y, width, height) {
    const object = {
      scene, x, y, width, height, changes: 0,
      setDepth(depth) { this.depth = depth; return this; },
      setStrokeStyle(width, color, alpha) { this.strokeColor = color; return this; },
      setFillStyle(color) { this.fillColor = color; this.changes++; return this; },
      setOutlineStyle(color) { this.outlineColor = color; return this; },
      destroy() { this.destroyed = true; this.scene = null; }
    };
    objects.push(object);
    return object;
  }
  const group = {
    scene, children: [],
    add(object) { this.children.push(object); },
    destroy(destroyChildren) { this.destroyed = true; this.scene = null; if (destroyChildren) this.children.forEach(child => child.destroy()); }
  };
  scene.add = { rectangle: shape, grid: shape };
  scene.physics = { add: {
    staticGroup() { return group; },
    existing(object, isStatic) {
      object.body = {
        isStatic,
        setSize(width, height) { this.width = width; this.height = height; },
        updateFromGameObject() { this.x = object.x - object.width / 2; this.y = object.y - object.height / 2; }
      };
    },
    collider(first, second) {
      const collider = { first, second, destroyed: false, destroy() { this.destroyed = true; } };
      colliders.push(collider);
      return collider;
    }
  } };
  return { Arena: window.CoinDashArena, scene, objects, colliders, group, game };
}

test('four static bodies match obstacle geometry and center corridors stay open', () => {
  const h = setup();
  const arena = new h.Arena(h.scene);
  assert.equal(h.group.children.length, 4);
  assert.equal(arena.isClear(400, 250, 60), true);
  for (let y = 64; y <= 464; y += 10) assert.equal(arena.isClear(400, y), true);
  for (let x = 36; x <= 764; x += 10) assert.equal(arena.isClear(x, 260), true);
  for (const object of h.group.children) {
    assert.equal(object.body.isStatic, true);
    assert.equal(object.body.width, object.width);
    assert.equal(object.body.height, object.height);
    assert.equal(object.body.x, object.x - object.width / 2);
    assert.equal(object.body.y, object.y - object.height / 2);
    assert.equal(arena.isClear(object.x, object.y, 0), false);
  }
});

test('clearance respects arena boundaries, radii and expanded obstacle edges', () => {
  const h = setup();
  const arena = new h.Arena(h.scene);
  for (const [x, y] of [[36, 64], [764, 64], [36, 464], [764, 464]]) assert.equal(arena.isClear(x, y), true);
  for (const [x, y] of [[35.9, 64], [764.1, 64], [36, 63.9], [36, 464.1]]) assert.equal(arena.isClear(x, y), false);
  assert.equal(arena.isClear(210 - 52 - 20, 150), false);
  assert.equal(arena.isClear(210 - 52 - 20 - 0.1, 150), true);
  for (const args of [[NaN, 100], [100, Infinity], [100, 100, -1], [100, 100, NaN]]) assert.equal(arena.isClear(...args), false);
});

test('level palettes cycle without moving bodies or recoloring every frame', () => {
  const h = setup();
  const arena = new h.Arena(h.scene);
  const initial = arena.palette;
  const geometry = h.group.children.map(object => [object.x, object.y, object.body.x, object.body.y]);
  const names = [];
  for (let level = 1; level <= 4; level++) { arena.setLevel(level); names.push(arena.palette.name); }
  assert.deepEqual(names, ['teal', 'purple', 'blue', 'orange']);
  assert.deepEqual(h.group.children.map(object => [object.x, object.y, object.body.x, object.body.y]), geometry);
  arena.setLevel(5);
  assert.equal(arena.palette, initial);
  const writes = arena.background.changes;
  arena.setLevel(5);
  assert.equal(arena.background.changes, writes);
  arena.setLevel(NaN);
  assert.equal(arena.palette, initial);
});

test('attach registers separate colliders, sets drone bounce, and avoids duplicates', () => {
  const h = setup();
  const arena = new h.Arena(h.scene);
  const player = {};
  const enemy = { body: { setBounce(x, y) { this.bounce = [x, y]; } } };
  const drones = { getChildren() { return [enemy]; } };
  arena.attach(player, drones);
  assert.equal(h.colliders.length, 2);
  assert.equal(h.colliders[0].first, player);
  assert.equal(h.colliders[1].first, drones);
  assert.equal(h.colliders[0].second, h.group);
  assert.deepEqual(enemy.body.bounce, [1, 1]);
  arena.attach(player, drones);
  assert.equal(h.colliders.length, 2);
  arena.attach({}, drones);
  assert.equal(h.colliders[0].destroyed, true);
  assert.equal(h.colliders[1].destroyed, true);
  assert.equal(h.colliders.length, 4);
});

test('destroy releases owned objects and colliders, restores border, and is idempotent', () => {
  const h = setup();
  const arena = new h.Arena(h.scene);
  arena.attach({}, { getChildren() { return []; } });
  arena.destroy();
  arena.destroy();
  assert.ok(h.objects.every(object => object.destroyed));
  assert.ok(h.colliders.every(collider => collider.destroyed));
  assert.equal(h.group.destroyed, true);
  assert.equal(h.game.style.borderColor, '#123456');
  arena.setLevel(3);
  arena.attach({}, {});
  assert.equal(arena.isClear(400, 250), false);
});

test('cleanup tolerates objects already removed by Phaser shutdown', () => {
  const h = setup();
  const arena = new h.Arena(h.scene);
  h.group.destroy(true);
  arena.background.destroy();
  arena.grid.destroy();
  assert.doesNotThrow(() => arena.destroy());
});
