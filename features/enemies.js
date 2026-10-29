/* Ports Hila's enemy types from 667692d without replacing the shared game core. */
(function (root) {
  'use strict';
  const TYPES = Object.freeze({
    chaser: Object.freeze({ speed: 0.6, color: 0xff657a, points: 5 }),
    patroller: Object.freeze({ speed: 1.2, color: 0xff9f1c, points: 3 }),
    zipper: Object.freeze({ speed: 2, color: 0xc77dff, points: 10 })
  });
  const ORDER = Object.keys(TYPES);
  const behaviors = new WeakMap();
  const living = enemy => enemy && enemy.active !== false && enemy.body && enemy.body.enable !== false;

  class EnemyBehavior {
    constructor(scene, enemy, index) {
      this.scene = scene;
      this.enemy = enemy;
      const supplied = enemy.getData('type');
      this.type = TYPES[supplied] ? supplied : ORDER[Math.abs(index || 0) % ORDER.length];
      this.spec = TYPES[this.type];
      enemy.setData('type', this.type);
      enemy.setData('speedMultiplier', this.spec.speed);
      enemy.setData('killPoints', this.spec.points);
      enemy.setTint?.(this.spec.color);
      this.axis = index % 2 ? 'y' : 'x';
      const bounds = scene.physics?.world?.bounds || { left: 16, right: 784, top: 44, bottom: 484 };
      const low = this.axis === 'x' ? bounds.left : bounds.top;
      const high = this.axis === 'x' ? bounds.right : bounds.bottom;
      const edge = (this.axis === 'x' ? enemy.displayWidth || enemy.width : enemy.displayHeight || enemy.height) / 2 || 14;
      this.min = Math.max(low + edge, enemy[this.axis] - 120);
      this.max = Math.min(high - edge, enemy[this.axis] + 120);
      enemy.setData('axis', this.axis);
      enemy.setData('min', this.min);
      enemy.setData('max', this.max);
      this.refresh();
    }
    speed() {
      const base = this.scene.config?.droneSpeed;
      const scale = this.scene.round?.speedMultiplier;
      const multiplier = this.enemy.getData('speedMultiplier');
      return (Number.isFinite(base) && base >= 0 ? base : 90) *
        (Number.isFinite(scale) && scale > 0 ? scale : 1) *
        (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : this.spec.speed);
    }
    runners() {
      const runners = typeof this.scene.getRunners === 'function'
        ? this.scene.getRunners() : [{ player: this.scene.player }];
      return runners.filter(runner => runner.player && runner.player.active !== false);
    }
    refresh() {
      const enemy = this.enemy;
      if (!living(enemy) || enemy.getData('enraged')) return;
      const speed = this.speed();
      const velocity = enemy.body.velocity;
      if (this.type === 'patroller') {
        let sign = velocity[this.axis] < 0 ? -1 : 1;
        if (enemy[this.axis] <= this.min) sign = 1;
        else if (enemy[this.axis] >= this.max) sign = -1;
        enemy.body.setVelocity(this.axis === 'x' ? sign * speed : 0, this.axis === 'y' ? sign * speed : 0);
      } else if (this.type === 'zipper') {
        const length = Math.hypot(velocity.x, velocity.y);
        enemy.body.setVelocity(length ? velocity.x / length * speed : speed / Math.SQRT2,
          length ? velocity.y / length * speed : speed / Math.SQRT2);
      }
    }
    update(delta) {
      const enemy = this.enemy;
      if (!living(enemy) || enemy.getData('enraged')) return;
      if (this.type === 'chaser') {
        let target = null, nearest = Infinity;
        for (const runner of this.runners()) {
          const distance = Math.hypot(runner.player.x - enemy.x, runner.player.y - enemy.y);
          if (distance < nearest) { nearest = distance; target = runner.player; }
        }
        if (!target || !Number.isFinite(nearest)) { enemy.body.setVelocity(0, 0); return; }
        const dx = target.x - enemy.x, dy = target.y - enemy.y;
        const speed = this.speed();
        enemy.body.setVelocity(nearest ? dx / nearest * speed : 0, nearest ? dy / nearest * speed : 0);
        if (nearest) enemy.rotation = Math.atan2(dy, dx) + Math.PI / 2;
      } else {
        this.refresh();
        if (this.type === 'zipper') enemy.rotation = (enemy.rotation || 0) + delta * 0.012;
      }
    }
  }

  root.CoinDashEnemies = {
    TYPES,
    decorate(scene, enemy, index, _level) { behaviors.set(enemy, new EnemyBehavior(scene, enemy, index)); },
    update(scene, delta) {
      if (scene.finished || scene.paused || !Number.isFinite(delta) || delta < 0) return;
      for (const enemy of scene.drones.getChildren()) behaviors.get(enemy)?.update(delta);
    },
    levelChanged(scene, _level) {
      for (const enemy of scene.drones.getChildren()) behaviors.get(enemy)?.refresh();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
