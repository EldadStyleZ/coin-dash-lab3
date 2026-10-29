/* Active-round powerups; speed effect adapted from Hila's 1b5f212 contribution. */
(function (root) {
  'use strict';
  const validTime = time => Number.isFinite(time) && time >= 0;
  const kinds = {
    shield: { label: 'Shield coin', glyph: '🛡', color: 0x71e8ce },
    magnet: { label: 'Magnet coin', glyph: '🧲', color: 0xc299ff },
    speed: { label: 'Speed coin', glyph: '»', color: 0xff9f43 }
  };

  class PowerupState {
    constructor() {
      this.nextSpawnAt = 6000;
      this.nextType = 'shield';
      this.pickup = null;
      this.shieldUntil = 0;
      this.shieldReady = false;
      this.graceUntil = 0;
      this.magnetUntil = 0;
      this.speedUntil = 0;
    }

    update(time) {
      if (!validTime(time)) return;
      if (time >= this.shieldUntil) this.shieldReady = false;
      if (this.pickup && time >= this.pickup.expiresAt) this.pickup = null;
      if (!this.pickup && time >= this.nextSpawnAt) {
        this.pickup = { type: this.nextType, expiresAt: time + 8000 };
        this.nextType = { shield: 'magnet', magnet: 'speed', speed: 'shield' }[this.nextType];
        this.nextSpawnAt = time + 12000;
      }
    }

    collect(time, receiver = this) {
      if (!validTime(time) || !this.pickup || time >= this.pickup.expiresAt) return null;
      const type = this.pickup.type;
      this.pickup = null;
      receiver.activate(type, time);
      return type;
    }

    activate(type, time) {
      if (!validTime(time) || !Object.hasOwn(kinds, type)) return;
      if (type === 'shield') {
        this.shieldReady = true;
        this.shieldUntil = time + 10000;
      } else if (type === 'magnet') this.magnetUntil = time + 8000;
      else this.speedUntil = time + 5000;
    }

    shieldActive(time) { return validTime(time) && this.shieldReady && time < this.shieldUntil; }
    magnetActive(time) { return validTime(time) && time < this.magnetUntil; }
    graceActive(time) { return validTime(time) && time < this.graceUntil; }
    speedMultiplier(time) { return validTime(time) && time < this.speedUntil ? 1.6 : 1; }
    clearEffects() {
      this.shieldReady = false;
      this.shieldUntil = this.magnetUntil = this.speedUntil = this.graceUntil = 0;
    }

    absorbHit(time) {
      if (!validTime(time)) return false;
      if (this.graceActive(time)) return true;
      if (!this.shieldActive(time)) return false;
      this.shieldReady = false;
      this.graceUntil = time + 400;
      return true;
    }
  }

  function magnetPosition(coin, player, delta, isSpawnClear) {
    const unchanged = { x: coin.x, y: coin.y };
    if (![coin.x, coin.y, player.x, player.y, delta].every(Number.isFinite) || delta <= 0) return unchanged;
    const dx = player.x - coin.x, dy = player.y - coin.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0 || distance > 140) return unchanged;
    // With arena geometry, short steps plus a radius check prevent tunnelling
    // through even thin walls. Older scenes without the hook keep their speed.
    const step = Math.min(distance, 260 * delta / 1000, typeof isSpawnClear === 'function' ? 12 : Infinity);
    const position = { x: coin.x + dx / distance * step, y: coin.y + dy / distance * step };
    if (typeof isSpawnClear === 'function' && !isSpawnClear(position.x, position.y, 12)) return unchanged;
    return position;
  }

  class CoinDashPowerups {
    constructor(scene) {
      this.scene = scene;
      this.state = new PowerupState();
      // The legacy state remains P1's effects and the shared pickup schedule.
      this.effects = new Map([['p1', this.state]]);
      this.auras = new Map();
      this.seenRunnerIds = new Set();
      this.pickup = null;
      this.aura = null;
      this.destroyed = false;
      this.finished = false;
      this.status = root.document?.getElementById('powerup-status') || null;
      this.renderStatus(0);
    }

    runners() {
      const candidates = typeof this.scene.getRunners === 'function'
        ? this.scene.getRunners() : [{ id: 'p1', player: this.scene.player }];
      const runners = (candidates || []).filter(runner => runner && runner.active !== false && runner.alive !== false
        && !runner.dead && runner.lives?.remaining !== 0 && runner.player && runner.player.active !== false
        && runner.player.body?.enable !== false && Number.isFinite(runner.player.x) && Number.isFinite(runner.player.y));
      for (const runner of runners) this.seenRunnerIds.add(runner.id || 'p1');
      return runners;
    }

    effectFor(id = 'p1') {
      if (!this.effects.has(id)) this.effects.set(id, new PowerupState());
      return this.effects.get(id);
    }

    pruneEffects(runners) {
      const ids = new Set(runners.map(runner => runner.id || 'p1'));
      for (const [id, effect] of this.effects) {
        if (ids.has(id)) continue;
        effect.clearEffects();
        if (id !== 'p1') this.effects.delete(id);
      }
      for (const [id, aura] of this.auras) if (!ids.has(id)) { aura.destroy(); this.auras.delete(id); }
    }

    spawnPosition() {
      const { config = {} } = this.scene;
      const runners = this.runners();
      if (!runners.length) return null;
      const width = Number.isFinite(config.width) ? Math.max(100, config.width) : 800;
      const height = Number.isFinite(config.height) ? Math.max(140, config.height) : 500;
      const bounds = { left: 44, right: width - 44, top: 76, bottom: height - 44 };
      const distance = point => Math.min(...runners.map(({ player }) => Math.hypot(point.x - player.x, point.y - player.y)));
      const valid = (x, y) => distance({ x, y }) >= 85
        && (typeof this.scene.isSpawnClear !== 'function' || this.scene.isSpawnClear(x, y, 20));
      for (let attempt = 0; attempt < 16; attempt++) {
        const x = bounds.left + Math.random() * (bounds.right - bounds.left);
        const y = bounds.top + Math.random() * (bounds.bottom - bounds.top);
        if (valid(x, y)) return { x, y };
      }
      // A deterministic fallback avoids an unbounded retry on cramped arenas.
      const corners = [
        { x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top },
        { x: bounds.left, y: bounds.bottom }, { x: bounds.right, y: bounds.bottom }
      ].sort((a, b) => distance(b) - distance(a));
      for (const point of corners) if (valid(point.x, point.y)) return point;
      const columns = Math.min(32, Math.max(1, Math.ceil((bounds.right - bounds.left) / 24)));
      const rows = Math.min(32, Math.max(1, Math.ceil((bounds.bottom - bounds.top) / 24)));
      for (let row = 0; row <= rows; row++) {
        for (let column = 0; column <= columns; column++) {
          const x = bounds.left + column / columns * (bounds.right - bounds.left);
          const y = bounds.top + row / rows * (bounds.bottom - bounds.top);
          if (valid(x, y)) return { x, y };
        }
      }
      return null;
    }

    spawnPickup() {
      const position = this.spawnPosition();
      if (!position) {
        // Skip this scheduled coin if the arena has no safe spot, never put it
        // inside a wall or loop forever. The following scheduled spawn remains.
        this.state.pickup = null;
        return;
      }
      const { x, y } = position;
      const model = this.state.pickup;
      const kind = kinds[model.type];
      const shape = this.scene.add.circle(x, y, 17, 0xb98a31, 1).setStrokeStyle(3, kind.color);
      const inset = this.scene.add.circle(x, y, 13, 0xffd166, 1).setStrokeStyle(1, 0xfff1b0);
      const label = this.scene.add.text(x, y, kind.glyph, {
        font: '18px sans-serif', color: '#152b40'
      }).setOrigin(0.5);
      const caption = this.scene.add.text(x, y - 29, kind.label, {
        font: '9px monospace', color: '#e5edf7', backgroundColor: '#101c31'
      }).setOrigin(0.5);
      this.pickup = { x, y, model, objects: [shape, inset, label, caption] };
    }

    removePickup() {
      this.pickup?.objects.forEach(object => object.destroy());
      this.pickup = null;
    }

    update(time, delta) {
      if (this.scene.finished) this.finish();
      if (this.destroyed || this.finished || this.scene.paused || !validTime(time)) return;
      const runners = this.runners();
      this.pruneEffects(runners);
      this.state.update(time);
      if (this.pickup && this.pickup.model !== this.state.pickup) this.removePickup();
      if (this.state.pickup && !this.pickup) this.spawnPickup();
      const collector = this.pickup ? runners.filter(runner =>
        Math.hypot(runner.player.x - this.pickup.x, runner.player.y - this.pickup.y) <= 29
      ).sort((a, b) => Math.hypot(a.player.x - this.pickup.x, a.player.y - this.pickup.y)
        - Math.hypot(b.player.x - this.pickup.x, b.player.y - this.pickup.y))[0] : null;
      if (collector) {
        const { x, y } = this.pickup;
        const runnerId = collector.id || 'p1';
        const type = this.state.collect(time, this.effectFor(runnerId));
        this.removePickup();
        // Core awards normal coin score/time/mission credit. This module never
        // relocates the regular coin merely because a special coin was collected.
        if (type) this.scene.events?.emit('special-coin', { type, x, y, runnerId });
      }
      const coin = this.scene.coin;
      if (coin && coin.active !== false) {
        // A single coin follows the nearest active magnet owner, rather than
        // being moved twice in opposite directions when both runners have one.
        const owner = runners.filter(runner => this.effects.get(runner.id || 'p1')?.magnetActive(time))
          .sort((a, b) => Math.hypot(a.player.x - coin.x, a.player.y - coin.y)
            - Math.hypot(b.player.x - coin.x, b.player.y - coin.y))[0];
        if (owner) {
          const isSpawnClear = typeof this.scene.isSpawnClear === 'function'
            ? (x, y, radius) => this.scene.isSpawnClear(x, y, radius) : undefined;
          const position = magnetPosition(coin, owner.player, delta, isSpawnClear);
          if (position.x !== coin.x || position.y !== coin.y) {
            coin.setPosition(position.x, position.y);
            coin.body?.reset(position.x, position.y);
          }
        }
      }
      this.renderAura(time);
      this.renderStatus(time);
    }

    renderAura(time) {
      for (const runner of this.runners()) {
        const id = runner.id || 'p1';
        const state = this.effects.get(id);
        const shield = state && (state.shieldActive(time) || state.graceActive(time));
        const magnet = state?.magnetActive(time);
        const speed = state?.speedMultiplier(time) > 1;
        if (!shield && !magnet && !speed) { this.auras.get(id)?.setVisible(false); continue; }
        if (!this.auras.has(id)) this.auras.set(id, this.scene.add.circle(0, 0, 22, 0x000000, 0));
        this.auras.get(id).setPosition(runner.player.x, runner.player.y)
          .setStrokeStyle(2, shield ? kinds.shield.color : magnet ? kinds.magnet.color : kinds.speed.color, 0.85).setVisible(true);
      }
      this.aura = this.auras.get('p1') || null;
    }

    renderStatus(time) {
      if (!this.status) return;
      const parts = [];
      const runners = this.runners();
      for (const runner of runners) {
        const id = runner.id || 'p1';
        const state = this.effects.get(id);
        if (!state) continue;
        const prefix = this.seenRunnerIds.size > 1 ? id.toUpperCase() + ': ' : '';
        if (state.shieldActive(time)) parts.push(`${prefix}Shield ready · ${Math.ceil((state.shieldUntil - time) / 1000)}s`);
        else if (state.graceActive(time)) parts.push(prefix + 'Shield absorbed a hit!');
        if (state.magnetActive(time)) parts.push(`${prefix}Coin magnet · ${Math.ceil((state.magnetUntil - time) / 1000)}s`);
        if (state.speedMultiplier(time) > 1) parts.push(`${prefix}Speed ×1.6 · ${Math.ceil((state.speedUntil - time) / 1000)}s`);
      }
      if (this.state.pickup) parts.push(`${kinds[this.state.pickup.type].label} on the field · ${Math.ceil((this.state.pickup.expiresAt - time) / 1000)}s`);
      if (!parts.length) parts.push(`Next powerup in ${Math.max(0, Math.ceil((this.state.nextSpawnAt - time) / 1000))}s`);
      const text = parts.join(' / ');
      if (this.status.textContent !== text) this.status.textContent = text;
    }

    absorbHit(time, runnerId = 'p1') {
      if (this.destroyed || this.finished || this.scene.finished || this.scene.paused
        || !this.runners().some(runner => (runner.id || 'p1') === runnerId)) return false;
      const absorbed = this.effects.get(runnerId)?.absorbHit(time) || false;
      if (absorbed) { this.renderAura(time); this.renderStatus(time); }
      return absorbed;
    }

    speedMultiplier(time, runnerId = 'p1') {
      if (this.destroyed || this.finished || this.scene.finished
        || !this.runners().some(runner => (runner.id || 'p1') === runnerId)) return 1;
      return this.effects.get(runnerId)?.speedMultiplier(time) || 1;
    }

    finish() {
      if (this.finished) return;
      this.finished = true;
      this.removePickup();
      this.state.pickup = null;
      for (const state of this.effects.values()) state.clearEffects();
      for (const aura of this.auras.values()) aura.destroy();
      this.auras.clear();
      this.aura = null;
      if (this.status) this.status.textContent = '';
    }

    destroy() {
      if (this.destroyed) return;
      this.finish();
      this.destroyed = true;
      this.effects.clear();
    }
  }
  CoinDashPowerups.PowerupState = PowerupState;
  CoinDashPowerups.magnetPosition = magnetPosition;
  root.CoinDashPowerups = CoinDashPowerups;
  if (typeof module !== 'undefined' && module.exports) module.exports = CoinDashPowerups;
}(typeof window !== 'undefined' ? window : globalThis));
