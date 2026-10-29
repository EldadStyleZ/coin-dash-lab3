/* Hila's close-call bonus (8a2e648), using per-runner state and shared scoring. */
(function (root) {
  'use strict';
  function bodyGap(a, b) {
    if (!a || !b || ![a.left, a.right, a.top, a.bottom, b.left, b.right, b.top, b.bottom].every(Number.isFinite)) return Infinity;
    const sx = Math.max(a.left - b.right, b.left - a.right);
    const sy = Math.max(a.top - b.bottom, b.top - a.bottom);
    return sx <= 0 && sy <= 0 ? 0 : Math.hypot(Math.max(0, sx), Math.max(0, sy));
  }
  const active = sprite => sprite && sprite.active !== false && sprite.body && sprite.body.enable !== false
    && !sprite.dead && !sprite.killed && !sprite.getData?.('killed') && !sprite.getData?.('dead');

  class CoinDashNearMiss {
    constructor(scene) {
      this.scene = scene;
      this.records = new WeakMap();
      this.previousEnemies = new Set();
      this.count = 0;
      this.destroyed = false;
    }
    runners() {
      const runners = typeof this.scene.getRunners === 'function' ? this.scene.getRunners() : [{ id: 'p1', player: this.scene.player }];
      return (runners || []).filter(runner => runner && runner.active !== false && runner.alive !== false && !runner.dead
        && runner.lives?.remaining !== 0 && active(runner.player));
    }
    record(enemy, id) {
      if (!this.records.has(enemy)) this.records.set(enemy, new Map());
      const records = this.records.get(enemy);
      if (!records.has(id)) records.set(id, { state: null, readyAt: 0 });
      return records.get(id);
    }
    contact(runnerId, enemy) {
      if (this.destroyed || !enemy || (typeof enemy !== 'object' && typeof enemy !== 'function')) return;
      this.record(enemy, runnerId || 'p1').state = 'touched';
    }
    update(time) {
      if (this.destroyed || this.scene.finished || this.scene.paused || !Number.isFinite(time) || time < 0) return;
      const runners = this.runners();
      const ids = new Set(runners.map(runner => runner.id || 'p1'));
      const enemies = this.scene.drones?.getChildren?.() || [];
      const currentEnemies = new Set(enemies);
      for (const enemy of this.previousEnemies) if (!currentEnemies.has(enemy)) this.records.delete(enemy);
      this.previousEnemies = currentEnemies;
      for (const enemy of enemies) {
        if (!active(enemy)) { this.records.delete(enemy); continue; }
        const previous = this.records.get(enemy);
        if (previous) for (const id of previous.keys()) if (!ids.has(id)) previous.delete(id);
        for (const runner of runners) {
          const id = runner.id || 'p1';
          const record = this.record(enemy, id);
          const gap = bodyGap(runner.player.body, enemy.body);
          if (!Number.isFinite(gap)) { record.state = null; continue; }
          if (gap <= 0) record.state = 'touched';
          else if (gap <= 18) {
            if (!record.state && time >= record.readyAt) record.state = 'armed';
          } else {
            if (record.state === 'armed') {
              record.readyAt = time + 1500;
              this.count++;
              this.scene.awardPoints?.(2, 'near-miss', id);
              this.scene.reactions?.announce?.(`${runners.length > 1 ? id.toUpperCase() + ' ' : ''}Close call! +2`);
            }
            record.state = null;
          }
        }
      }
    }
    destroy() { this.destroyed = true; this.records = new WeakMap(); this.previousEnemies.clear(); }
  }
  CoinDashNearMiss.bodyGap = bodyGap;
  root.CoinDashNearMiss = CoinDashNearMiss;
  if (typeof module !== 'undefined' && module.exports) module.exports = CoinDashNearMiss;
}(typeof window !== 'undefined' ? window : globalThis));
