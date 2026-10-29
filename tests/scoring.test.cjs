const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../features/scoring.js'), 'utf8');

function load(options = {}) {
  const records = options.records || new Map();
  const element = { textContent: '', setAttribute() {} };
  const window = {
    localStorage: options.storage || {
      getItem(key) { return records.get(key) || null; },
      setItem(key, value) { records.set(key, value); }
    },
    document: { getElementById(id) { return id === 'progress-status' ? element : null; } }
  };
  if (options.noStorage) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
  vm.runInNewContext(source, { window });
  return { Scoring: window.CoinDashScoring, element, records };
}
const scene = (overrides = {}) => ({ config: { droneCount: 3, startingLives: 3, roundSeconds: 60 }, paused: false, runTime: 0, ...overrides });

test('combo increases on third and sixth coins, caps at three, totals points', () => {
  const { Scoring } = load();
  const scoring = new Scoring(scene());
  const awards = Array.from({ length: 8 }, (_, i) => scoring.collect(i * 200));
  assert.deepEqual(awards.map(result => result.points), [1, 1, 2, 2, 2, 3, 3, 3]);
  assert.equal(scoring.total, 17);
  assert.equal(scoring.coins, 8);
});

test('combo continues just below four seconds and expires at the exact boundary', () => {
  const { Scoring } = load();
  const scoring = new Scoring(scene());
  scoring.collect(0);
  scoring.collect(3999);
  assert.equal(scoring.collect(7998).combo, 2);
  scoring.update(11997);
  assert.equal(scoring.combo, 2);
  scoring.update(11998);
  assert.equal(scoring.combo, 1);
  assert.equal(scoring.collect(11998).points, 1);
  assert.equal(scoring.streak, 1);
});

test('pause and unchanged active time do not consume combo duration', () => {
  const { Scoring } = load();
  const active = scene();
  const scoring = new Scoring(active);
  scoring.collect(0);
  scoring.collect(100);
  scoring.collect(200);
  active.paused = true;
  scoring.update(100000);
  assert.equal(scoring.collect(100000).points, 0);
  active.paused = false;
  for (let i = 0; i < 100; i++) scoring.update(200);
  assert.equal(scoring.collect(4199).points, 2);
});

test('invalid and backward timestamps cannot add points or corrupt a later combo', () => {
  const { Scoring } = load();
  const scoring = new Scoring(scene());
  scoring.collect(100);
  for (const time of [undefined, NaN, Infinity, -1, '200', 99]) {
    assert.equal(scoring.collect(time).points, 0);
    scoring.update(time);
  }
  assert.equal(scoring.total, 1);
  assert.equal(scoring.collect(101).points, 1);
  assert.equal(scoring.collect(102).points, 2);
});

test('achievements count coins rather than points and expire in active time', () => {
  const { Scoring, element } = load();
  const scoring = new Scoring(scene());
  for (let i = 0; i < 5; i++) scoring.collect(i * 100);
  assert.match(element.textContent, /first 5 coins/);
  scoring.update(3899);
  assert.match(element.textContent, /first 5 coins/);
  scoring.update(3900);
  assert.doesNotMatch(element.textContent, /first 5 coins/);
  for (let i = 5; i < 10; i++) scoring.collect(4000 + i * 100);
  assert.match(element.textContent, /10-coin collector/);
});

test('personal best persists across sessions and is isolated by initial settings', () => {
  const first = load();
  const active = scene();
  const scoring = new first.Scoring(active);
  active.config.droneCount = 10;
  scoring.finish(20, 4);
  assert.equal(scoring.best, 20);
  const second = load({ records: first.records });
  assert.equal(new second.Scoring(scene()).best, 20);
  assert.equal(new second.Scoring(scene({ config: { droneCount: 4, startingLives: 3 } })).best, 0);
  assert.equal(new second.Scoring(scene({ config: { droneCount: 3, startingLives: 5 } })).best, 0);
  const lower = new second.Scoring(scene());
  lower.finish(1, 1);
  assert.equal(lower.best, 20);
});

test('malformed, negative and nonnumeric saved records are ignored', () => {
  for (const record of ['not json', 'null', '42', '{"score":-1}', '{"score":"99"}', '{"score":1.5}', '{"score":1e100}']) {
    const { Scoring } = load({ storage: { getItem() { return record; }, setItem() {} } });
    assert.equal(new Scoring(scene()).best, 0);
  }
});

test('blocked storage keeps a session best without throwing on restart', () => {
  const { Scoring } = load({ noStorage: true });
  const scoring = new Scoring(scene());
  scoring.finish(12, 2);
  scoring.destroy();
  const restarted = new Scoring(scene());
  assert.equal(restarted.best, 12);
  assert.equal(restarted.total, 0);
  assert.equal(restarted.combo, 1);
  assert.equal(restarted.coins, 0);
});

test('finishing or destroying is idempotent and prevents later score changes', () => {
  const { Scoring, element } = load();
  const scoring = new Scoring(scene({ runTime: 60000 }));
  scoring.collect(10);
  scoring.finish(1, 6);
  assert.match(element.textContent, /round survived/);
  scoring.finish(99, 9);
  assert.equal(scoring.collect(100).points, 0);
  scoring.update(100000);
  assert.equal(scoring.total, 1);
  const finalText = element.textContent;
  scoring.destroy();
  scoring.destroy();
  scoring.collect(200000);
  assert.equal(element.textContent, finalText);
});

test('finishing rechecks storage to avoid lowering another tab\'s best', () => {
  const { Scoring, records } = load();
  const scoring = new Scoring(scene());
  records.set(scoring.storageKey, JSON.stringify({ score: 50, level: 5 }));
  scoring.finish(20, 2);
  assert.equal(scoring.best, 50);
  assert.equal(JSON.parse(records.get(scoring.storageKey)).score, 50);
});
test('death after base duration is not survival when coin bonus time remains', () => {
 const { Scoring, element } = load();
 const active = scene({ runTime: 65000, round: { secondsRemaining: 3 } });
 new Scoring(active).finish(4, 7);
 assert.doesNotMatch(element.textContent, /round survived/);
 const done = new Scoring(scene({ runTime: 68000, round: { secondsRemaining: 0 } }));
 done.finish(5, 7); assert.match(element.textContent, /round survived/);
});


test('bonus points never become coin credit and player combo chains stay separate', () => {
  const { Scoring } = load();
  const scoring = new Scoring(scene());
  scoring.collect(0, 'p1'); scoring.collect(100, 'p1');
  assert.equal(scoring.collect(200, 'p2').points, 1);
  assert.equal(scoring.collect(300, 'p1').points, 2);
  const coins = scoring.coins;
  assert.equal(scoring.award(10, 400), 10);
  assert.equal(scoring.total, 15);
  assert.equal(scoring.coins, coins);
  assert.equal(scoring.award(-1, 500), 0);
  scoring.scene.paused = true;
  assert.equal(scoring.award(10, 500), 0);
});

test('different difficulty and player modes have distinct personal records', () => {
  const { Scoring } = load();
  const normal = new Scoring(scene());
  normal.finish(100, 2);
  const hard = new Scoring(scene({ config: { droneCount: 3, startingLives: 3, difficulty: 'hard' } }));
  const pair = new Scoring(scene({ config: { droneCount: 3, startingLives: 3, playerCount: 2 } }));
  assert.equal(hard.best, 0); assert.equal(pair.best, 0);
});
