(function (root) {
  'use strict';
  const STRIKE_DURATION_MS = 180;
  const SWORD_DASH_MULTIPLIER = 2.5;
  const MISS_COOLDOWN_MS = 1000;

  class CoinDashAbilities {
    constructor(scene, options = {}) {
      this.scene = scene;
      this.boundKeys = options.keys || ['SPACE'];
      this.label = options.label || 'Space';
      this.runnerId = options.runnerId || 'p1';
      this.disabled = false;
      this.lastDirection = { x: 1, y: 0 };
      this.strikeDirection = { x: 1, y: 0 };
      this.strikeEndsAt = 0;
      this.nextStrikeAt = 0;
      this.strikeId = 0;
      this.destroyed = false;
      this.status = typeof document !== 'undefined' ? document.getElementById(options.statusId || 'strike-status') : null;
      this.keyboard = scene.input && scene.input.keyboard;
      this.onStrikeKey = event => {
        const target = event && event.target;
        const formFocused = target && (target.isContentEditable
          || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName || '')
          || (typeof target.closest === 'function' && target.closest('[contenteditable="true"]')));
        if (!event || event.repeat || event.ctrlKey || event.metaKey || event.altKey || formFocused) return;
        if (this.strike(this.scene.runTime) && typeof event.preventDefault === 'function') event.preventDefault();
      };
      if (this.keyboard && typeof this.keyboard.on === 'function') {
        this.boundKeys.forEach(key => this.keyboard.on(`keydown-${key}`, this.onStrikeKey));
      }
      this.renderStatus(0);
    }

    renderStatus(time) {
      if (!this.status) return;
      const remaining = Math.max(0, this.nextStrikeAt - time);
      const message = remaining === 0 ? `Strike ready · ${this.label}`
        : time < this.strikeEndsAt ? 'Striking!'
          : `Miss recovery · ${(Math.ceil(remaining / 100) / 10).toFixed(1)}s`;
      if (this.status.textContent !== message) this.status.textContent = message;
    }

    strike(time) {
      if (this.destroyed || this.disabled || this.scene.finished || this.scene.paused
        || !Number.isFinite(time) || time < 0 || time < this.nextStrikeAt) return false;
      this.strikeDirection = { ...this.lastDirection };
      this.strikeEndsAt = time + STRIKE_DURATION_MS;
      this.nextStrikeAt = time + MISS_COOLDOWN_MS;
      const strikeId = ++this.strikeId;
      // Commit cooldown and identity BEFORE listeners can synchronously score a hit.
      this.scene.events?.emit?.('player-strike', { runnerId: this.runnerId, strikeId });
      this.renderStatus(time);
      return true;
    }

    resetStrike(strikeId, time) {
      if (this.destroyed || this.disabled || this.scene.finished || this.scene.paused
          || strikeId !== this.strikeId || !Number.isFinite(time) || time < 0 || time >= this.strikeEndsAt) return false;
      this.nextStrikeAt = time;
      this.renderStatus(time);
      return true;
    }

    velocity(dx, dy, time) {
      if (this.destroyed || this.disabled || this.scene.finished || this.scene.paused
        || !Number.isFinite(time) || time < 0) return { x: 0, y: 0 };
      const x = Number.isFinite(dx) ? dx : 0;
      const y = Number.isFinite(dy) ? dy : 0;
      const length = Math.hypot(x, y);
      const direction = length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
      if (length > 0) this.lastDirection = direction;
      const configuredSpeed = this.scene.config && this.scene.config.playerSpeed;
      const speed = Number.isFinite(configuredSpeed) && configuredSpeed >= 0 ? configuredSpeed : 240;
      this.renderStatus(time);
      // The lunge belongs to the sword attack; Shift has no separate dash.
      const lunging = time < this.strikeEndsAt;
      const movement = lunging ? this.strikeDirection : direction;
      const multiplier = lunging ? SWORD_DASH_MULTIPLIER : 1;
      return { x: movement.x * speed * multiplier, y: movement.y * speed * multiplier };
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      if (this.keyboard && typeof this.keyboard.off === 'function') {
        this.boundKeys.forEach(key => this.keyboard.off(`keydown-${key}`, this.onStrikeKey));
      }
    }
  }
  root.CoinDashAbilities = CoinDashAbilities;
})(typeof window !== 'undefined' ? window : globalThis);
