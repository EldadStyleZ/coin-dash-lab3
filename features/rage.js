/* Temporary status overlay only. Enemy types and ordinary AI stay in their module. */
(function (root) {
  'use strict';
  const FIRST_RAGE_MS = 8000;
  const RAGE_INTERVAL_MS = 12000;
  const RAGE_DURATION_MS = 4000;
  const RAGE_TINT = 0xff3030;
  const MAX_CHASE_SPEED = 360;

  class CoinDashRage {
    constructor(scene) {
      this.scene = scene;
      this.time = 0;
      this.nextStartAt = FIRST_RAGE_MS;
      this.endsAt = 0;
      this.target = null;
      this.saved = null;
      this.selection = 0;
      this.destroyed = false;
      this.status = root.document?.getElementById('rage-status');
      this.render();
    }

    members() {
      return this.scene.drones?.getChildren?.() || [];
    }

    living(enemy) {
      return Boolean(enemy && enemy.active !== false && enemy.body && enemy.body.enable !== false);
    }

    start(time) {
      const candidates = this.members().filter(enemy => this.living(enemy) && !enemy.getData?.('enraged'));
      if (!candidates.length) { this.nextStartAt = time + 1000; return; }
      const enemy = candidates[this.selection++ % candidates.length];
      const velocity = enemy.body.velocity || { x: 0, y: 0 };
      const x = Number.isFinite(velocity.x) ? velocity.x : 0;
      const y = Number.isFinite(velocity.y) ? velocity.y : 0;
      const tint = ['tintTopLeft', 'tintTopRight', 'tintBottomLeft', 'tintBottomRight']
        .map(key => Number.isFinite(enemy[key]) ? enemy[key] : 0xffffff);
      const value = enemy.getData?.('enraged');
      const configuredSpeed = this.scene.config?.droneSpeed;
      this.saved = {
        velocity: { x, y },
        speed: Math.hypot(x, y) || (Number.isFinite(configuredSpeed) && configuredSpeed > 0 ? configuredSpeed : 90),
        tint, fill: Boolean(enemy.tintFill),
        tinted: typeof enemy.isTinted === 'boolean' ? enemy.isTinted : tint.some(color => color !== 0xffffff),
        hadFlag: enemy.data?.has ? enemy.data.has('enraged') : value !== undefined,
        flag: value
      };
      this.target = enemy;
      this.endsAt = time + RAGE_DURATION_MS;
      this.nextStartAt = time + RAGE_INTERVAL_MS;
      enemy.setData?.('enraged', true);
      enemy.setTint?.(RAGE_TINT);
      this.scene.audio?.play?.('angry');
    }

    restore() {
      const enemy = this.target;
      const saved = this.saved;
      this.target = null;
      this.saved = null;
      if (!enemy || !saved) return;
      // Destroyed sprites have no body. Avoid reviving their DataManager or
      // touching destroyed physics, while still restoring a live removed enemy.
      if (!enemy.body) return;
      if (!saved.tinted && typeof enemy.clearTint === 'function') enemy.clearTint();
      else if (saved.fill && typeof enemy.setTintFill === 'function') enemy.setTintFill(...saved.tint);
      else enemy.setTint?.(...saved.tint);
      if (saved.hadFlag) enemy.setData?.('enraged', saved.flag);
      else if (typeof enemy.data?.remove === 'function') enemy.data.remove('enraged');
      else enemy.setData?.('enraged', undefined);
      enemy.body.setVelocity(saved.velocity.x, saved.velocity.y);
      // Core reapplies current level/type speed after the original direction is
      // restored; the partner's normal AI takes over again on the next frame.
      if (typeof this.scene.setEnemySpeed === 'function') this.scene.setEnemySpeed(enemy);
    }

    chase() {
      const enemy = this.target;
      const player = this.scene.player;
      if (!enemy || !player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const length = Math.hypot(dx, dy);
      if (!Number.isFinite(length)) return;
      const speed = Math.min(MAX_CHASE_SPEED, this.saved.speed * 1.4);
      enemy.body.setVelocity(length > 0 ? dx / length * speed : 0, length > 0 ? dy / length * speed : 0);
    }

    render() {
      if (!this.status) return;
      const text = this.scene.finished ? 'Rage ended'
        : this.scene.config?.rageEnabled === false ? 'Rage disabled'
          : this.target ? `ANGRY ENEMY — run! ${Math.max(1, Math.ceil((this.endsAt - this.time) / 1000))}s`
            : `Swarm calm · rage in ${Math.max(0, Math.ceil((this.nextStartAt - this.time) / 1000))}s`;
      if (this.status.textContent !== text) this.status.textContent = text;
    }

    update(time, _delta) {
      if (this.destroyed) return;
      if (this.scene.finished || this.scene.config?.rageEnabled === false) {
        this.restore();
        this.render();
        return;
      }
      if (this.scene.paused || !Number.isFinite(time) || time < this.time) return;
      this.time = time;
      if (this.target && (!this.living(this.target) || !this.members().includes(this.target) || time >= this.endsAt)) this.restore();
      if (!this.target && time >= this.nextStartAt) this.start(time);
      this.chase();
      this.render();
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.restore();
      if (this.status) this.status.textContent = '';
    }
  }
  root.CoinDashRage = CoinDashRage;
})(typeof window !== 'undefined' ? window : globalThis);
