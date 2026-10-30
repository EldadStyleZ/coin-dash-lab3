/* Cosmetic lightning for accepted sword lunges. No physics, damage or timers. */
(function (root) {
  'use strict';
  const DURATION_MS = 180;
  const TAIL_MS = 100;
  const CYAN = 0x53dfff;
  const WHITE = 0xeafcff;

  class CoinDashLightning {
    constructor(scene) {
      this.scene = scene;
      this.time = 0;
      this.paused = false;
      this.finished = false;
      this.destroyed = false;
      this.effects = new Map();
      this.graphics = new Map();
      this.lastStrikeIds = new Map();
      this.reducedMotion = Boolean(root.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      this.onStrike = event => this.strike(event || {});
      scene.events?.on?.('player-strike', this.onStrike);
    }

    runner(id) {
      if (id !== 'p1' && id !== 'p2') return null;
      const runners = this.scene.getRunners?.()
        || [{ id: 'p1', player: this.scene.player, abilities: this.scene.abilities }];
      return runners.find(runner => runner.id === id && !runner.out && runner.player?.active !== false
        && runner.player?.body && runner.player.body.enable !== false);
    }

    active() {
      return !this.destroyed && !this.finished && !this.paused && !this.scene.paused && !this.scene.finished;
    }

    strike({ runnerId = 'p1', strikeId }) {
      if (!this.active()) return false;
      const runner = this.runner(runnerId);
      const ability = runner?.abilities;
      const time = Number.isFinite(this.scene.runTime) ? this.scene.runTime : this.time;
      if (!ability || ability.disabled || ability.destroyed || !Number.isFinite(time) || time < this.time
        || !Number.isSafeInteger(strikeId) || strikeId <= (this.lastStrikeIds.get(runnerId) || 0)
        || strikeId !== ability.strikeId || !Number.isFinite(ability.strikeEndsAt)
        || ability.strikeEndsAt <= time) return false;
      const direction = ability.strikeDirection || { x: 1, y: 0 };
      const length = Math.hypot(direction.x, direction.y);
      const dx = Number.isFinite(length) && length > 0 ? direction.x / length : 1;
      const dy = Number.isFinite(length) && length > 0 ? direction.y / length : 0;
      this.time = time;
      this.lastStrikeIds.set(runnerId, strikeId);
      let graphics = this.graphics.get(runnerId);
      if (!graphics && this.scene.add?.graphics) {
        graphics = this.scene.add.graphics();
        graphics.setDepth(7);
        this.graphics.set(runnerId, graphics);
      }
      const end = Math.min(ability.strikeEndsAt, time + DURATION_MS);
      const effect = { strikeId, start: time, end, expiresAt: end + (this.reducedMotion ? 0 : TAIL_MS),
        dx, dy, graphics, history: [], lastSample: -Infinity, frame: -1, alpha: null };
      this.effects.set(runnerId, effect);
      if (graphics) {
        graphics.setVisible(true);
        graphics.rotation = Math.atan2(dy, dx);
        this.draw(effect, runner.player, time);
      }
      this.scene.audio?.play?.('lightning');
      return true;
    }

    path(graphics, points, width, color, alpha) {
      graphics.lineStyle(width, color, alpha);
      graphics.beginPath();
      graphics.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) graphics.lineTo(points[i][0], points[i][1]);
      graphics.strokePath();
    }

    draw(effect, player, time) {
      const graphics = effect.graphics;
      if (!graphics) return;
      const tail = time >= effect.end;
      if (!tail) { effect.x = player.x; effect.y = player.y; }
      graphics.setPosition(effect.x, effect.y);
      const alpha = this.reducedMotion ? 0.8 : tail ? 0.45 * (effect.expiresAt - time) / TAIL_MS
        : Math.min(1, (effect.end - time) / 60 + 0.45);
      if (effect.alpha !== alpha) { graphics.setAlpha(alpha); effect.alpha = alpha; }
      if (!tail && !this.reducedMotion && time - effect.lastSample >= 32) {
        effect.history.push({ x: player.x, y: player.y });
        if (effect.history.length > 4) effect.history.shift();
        effect.lastSample = time;
      }
      const frame = this.reducedMotion ? 0 : tail ? 'tail' : Math.floor((time - effect.start) / 32);
      if (effect.frame === frame) return;
      effect.frame = frame;
      graphics.clear();
      if (this.reducedMotion) {
        // A steady, soft hand marker: no random bolts, sparks or moving trails.
        graphics.fillStyle(CYAN, 0.22);
        graphics.fillCircle(17, -2, 8);
        graphics.lineStyle(1.5, CYAN, 0.7);
        graphics.strokeCircle(17, -2, 8);
        return;
      }
      if (!tail) {
        graphics.fillStyle(CYAN, 0.12);
        graphics.fillCircle(18, -2, 13);
        graphics.fillStyle(CYAN, 0.48);
        graphics.fillCircle(18, -2, 7);
        graphics.fillStyle(WHITE, 0.85);
        graphics.fillCircle(18, -2, 3.5);
      }
      // Fixed work per frame: three branching arcs, two short trailing strands.
      const jitter = index => Math.sin(effect.strikeId * 13 + (tail ? 6 : frame) * 2.1 + index * 1.7) * 3;
      for (let arm = 0; arm < (tail ? 0 : 3); arm++) {
        const side = arm === 1 ? 1 : -1;
        const offset = arm === 2 ? 10 : 0;
        const points = [[18, -2], [9 + offset, side * 8 + jitter(arm)],
          [14 - offset, side * 13], [-2 - offset, side * 9 + jitter(arm + 3)],
          [-7 - offset, side * 18], [-16 - offset, side * 9 + jitter(arm + 6)]];
        this.path(graphics, points, 2.5, CYAN, 0.75);
        this.path(graphics, points, 1, WHITE, 0.8);
        this.path(graphics, [points[2], [points[2][0] + 5, points[2][1] + side * 7],
          [points[2][0] - 1, points[2][1] + side * 11]], 1, CYAN, 0.65);
      }
      for (const side of [-1, 1]) {
        const points = [[9, side * 7]];
        for (let i = effect.history.length - 1; i >= 0; i--) {
          const sample = effect.history[i];
          const wx = sample.x - effect.x, wy = sample.y - effect.y;
          if (Math.hypot(wx, wy) > 80) continue;
          points.push([wx * effect.dx + wy * effect.dy - 6,
            -wx * effect.dy + wy * effect.dx + side * (8 + jitter(i))]);
        }
        this.path(graphics, points, 1.5, CYAN, 0.5);
      }
      for (let i = 0; i < 3; i++) {
        const x = 10 - i * 13 + jitter(i + 9);
        const y = (i % 2 ? 1 : -1) * (21 + jitter(i + 12));
        this.path(graphics, [[x, y], [x + 3, y - 4]], 1.5, WHITE, 0.65);
      }
    }

    clear(id) {
      const effect = this.effects.get(id);
      if (!effect) return;
      effect.graphics?.clear();
      effect.graphics?.setVisible(false);
      this.effects.delete(id);
    }

    update(time, _delta) {
      if (this.scene.finished) { this.finish(); return; }
      if (!this.active() || !Number.isFinite(time) || time < this.time) return;
      this.time = time;
      for (const [id, effect] of this.effects) {
        const runner = this.runner(id);
        if (!runner || runner.abilities?.disabled || runner.abilities?.destroyed
          || runner.abilities?.strikeId !== effect.strikeId || time >= effect.expiresAt) this.clear(id);
        else this.draw(effect, runner.player, time);
      }
    }

    setPaused(paused) { this.paused = Boolean(paused); }

    finish() {
      if (this.finished) return;
      this.finished = true;
      this.effects.clear();
      for (const graphics of this.graphics.values()) graphics.destroy();
      this.graphics.clear();
      this.lastStrikeIds.clear();
    }

    destroy() {
      if (this.destroyed) return;
      this.finish();
      this.destroyed = true;
      this.scene.events?.off?.('player-strike', this.onStrike);
    }
  }
  root.CoinDashLightning = CoinDashLightning;
})(typeof window !== 'undefined' ? window : globalThis);
