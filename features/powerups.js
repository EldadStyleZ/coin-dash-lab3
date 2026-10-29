/* Active-round powerups; core retains all scoring, collisions and enemy logic. */
(function (root) {
  'use strict';
  const validTime = time => Number.isFinite(time) && time >= 0;

  class PowerupState {
    constructor() {
      this.nextSpawnAt = 6000;
      this.nextType = 'shield';
      this.pickup = null;
      this.shieldUntil = 0;
      this.shieldReady = false;
      this.graceUntil = 0;
      this.magnetUntil = 0;
    }

    update(time) {
      if (!validTime(time)) return;
      if (time >= this.shieldUntil) this.shieldReady = false;
      if (this.pickup && time >= this.pickup.expiresAt) this.pickup = null;
      if (!this.pickup && time >= this.nextSpawnAt) {
        this.pickup = { type: this.nextType, expiresAt: time + 8000 };
        this.nextType = this.nextType === 'shield' ? 'magnet' : 'shield';
        this.nextSpawnAt = time + 12000;
      }
    }

    collect(time) {
      if (!validTime(time) || !this.pickup || time >= this.pickup.expiresAt) return null;
      const type = this.pickup.type;
      this.pickup = null;
      if (type === 'shield') {
        this.shieldReady = true;
        this.shieldUntil = time + 10000;
      } else this.magnetUntil = time + 8000;
      return type;
    }

    shieldActive(time) { return validTime(time) && this.shieldReady && time < this.shieldUntil; }
    magnetActive(time) { return validTime(time) && time < this.magnetUntil; }
    graceActive(time) { return validTime(time) && time < this.graceUntil; }

    absorbHit(time) {
      if (!validTime(time)) return false;
      if (this.graceActive(time)) return true;
      if (!this.shieldActive(time)) return false;
      this.shieldReady = false;
      this.graceUntil = time + 400;
      return true;
    }
  }

  function magnetPosition(coin, player, delta) {
    const unchanged = { x: coin.x, y: coin.y };
    if (![coin.x, coin.y, player.x, player.y, delta].every(Number.isFinite) || delta <= 0) return unchanged;
    const dx = player.x - coin.x, dy = player.y - coin.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0 || distance > 140) return unchanged;
    const step = Math.min(distance, 260 * delta / 1000);
    return { x: coin.x + dx / distance * step, y: coin.y + dy / distance * step };
  }

  class CoinDashPowerups {
    constructor(scene) {
      this.scene = scene;
      this.state = new PowerupState();
      this.pickup = null;
      this.aura = null;
      this.destroyed = false;
      this.status = root.document?.getElementById('powerup-status') || null;
      this.renderStatus(0);
    }

    spawnPosition() {
      const { player, config = {} } = this.scene;
      const width = Number.isFinite(config.width) ? Math.max(100, config.width) : 800;
      const height = Number.isFinite(config.height) ? Math.max(140, config.height) : 500;
      const bounds = { left: 44, right: width - 44, top: 76, bottom: height - 44 };
      for (let attempt = 0; attempt < 16; attempt++) {
        const x = bounds.left + Math.random() * (bounds.right - bounds.left);
        const y = bounds.top + Math.random() * (bounds.bottom - bounds.top);
        if (Math.hypot(x - player.x, y - player.y) >= 85) return { x, y };
      }
      // A deterministic fallback avoids an unbounded retry on cramped arenas.
      return [
        { x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top },
        { x: bounds.left, y: bounds.bottom }, { x: bounds.right, y: bounds.bottom }
      ].sort((a, b) => Math.hypot(b.x - player.x, b.y - player.y) - Math.hypot(a.x - player.x, a.y - player.y))[0];
    }

    spawnPickup() {
      const { x, y } = this.spawnPosition();
      const model = this.state.pickup;
      const color = model.type === 'shield' ? 0x71e8ce : 0xc299ff;
      const shape = this.scene.add.circle(x, y, 15, 0x152b40, 1).setStrokeStyle(3, color);
      const label = this.scene.add.text(x, y, model.type === 'shield' ? 'S' : 'M', {
        font: 'bold 17px monospace', color: model.type === 'shield' ? '#71e8ce' : '#c299ff'
      }).setOrigin(0.5);
      const caption = this.scene.add.text(x, y - 27, model.type.toUpperCase(), {
        font: '9px monospace', color: '#e5edf7', backgroundColor: '#101c31'
      }).setOrigin(0.5);
      this.pickup = { x, y, model, objects: [shape, label, caption] };
    }

    removePickup() {
      this.pickup?.objects.forEach(object => object.destroy());
      this.pickup = null;
    }

    update(time, delta) {
      if (this.destroyed || this.scene.finished || this.scene.paused || !validTime(time)) return;
      this.state.update(time);
      if (this.pickup && this.pickup.model !== this.state.pickup) this.removePickup();
      if (this.state.pickup && !this.pickup) this.spawnPickup();
      if (this.pickup && Math.hypot(this.scene.player.x - this.pickup.x, this.scene.player.y - this.pickup.y) <= 29) {
        this.state.collect(time);
        this.removePickup();
      }
      if (this.state.magnetActive(time) && this.scene.coin?.active !== false) {
        const coin = this.scene.coin;
        if (coin) {
          const position = magnetPosition(coin, this.scene.player, delta);
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
      const shield = this.state.shieldActive(time) || this.state.graceActive(time);
      const magnet = this.state.magnetActive(time);
      if (!shield && !magnet) {
        this.aura?.setVisible(false);
        return;
      }
      if (!this.aura) this.aura = this.scene.add.circle(0, 0, 22, 0x000000, 0);
      this.aura.setPosition(this.scene.player.x, this.scene.player.y)
        .setStrokeStyle(2, shield ? 0x71e8ce : 0xc299ff, 0.85).setVisible(true);
    }

    renderStatus(time) {
      if (!this.status) return;
      const parts = [];
      if (this.state.shieldActive(time)) parts.push(`Shield ready · ${Math.ceil((this.state.shieldUntil - time) / 1000)}s`);
      else if (this.state.graceActive(time)) parts.push('Shield absorbed a hit!');
      if (this.state.magnetActive(time)) parts.push(`Coin magnet · ${Math.ceil((this.state.magnetUntil - time) / 1000)}s`);
      if (this.state.pickup) parts.push(`${this.state.pickup.type === 'shield' ? 'Shield' : 'Magnet'} on the field · ${Math.ceil((this.state.pickup.expiresAt - time) / 1000)}s`);
      if (!parts.length) parts.push(`Next powerup in ${Math.max(0, Math.ceil((this.state.nextSpawnAt - time) / 1000))}s`);
      const text = parts.join(' / ');
      if (this.status.textContent !== text) this.status.textContent = text;
    }

    absorbHit(time) {
      if (this.destroyed || this.scene.finished || this.scene.paused) return false;
      const absorbed = this.state.absorbHit(time);
      if (absorbed) { this.renderAura(time); this.renderStatus(time); }
      return absorbed;
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.removePickup();
      this.aura?.destroy();
      this.aura = null;
      if (this.status) this.status.textContent = '';
    }
  }
  CoinDashPowerups.PowerupState = PowerupState;
  CoinDashPowerups.magnetPosition = magnetPosition;
  root.CoinDashPowerups = CoinDashPowerups;
  if (typeof module !== 'undefined' && module.exports) module.exports = CoinDashPowerups;
}(typeof window !== 'undefined' ? window : globalThis));
