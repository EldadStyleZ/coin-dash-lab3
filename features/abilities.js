(function (root) {
  'use strict';

  const DASH_DURATION_MS = 180;
  const DASH_COOLDOWN_MS = 1800;
  const DASH_SPEED_MULTIPLIER = 2.5;

  class CoinDashAbilities {
    constructor(scene, options = {}) {
      this.scene = scene;
      this.boundKeys = options.keys || ['SHIFT', 'SPACE'];
      this.label = options.label || 'Space / Shift';
      this.runnerId = options.runnerId || 'p1';
      this.disabled = false;
      this.lastDirection = { x: 1, y: 0 };
      this.dashDirection = { x: 1, y: 0 };
      this.dashEndsAt = 0;
      this.nextDashAt = 0;
      this.destroyed = false;
      this.status = typeof document !== 'undefined' ? document.getElementById(options.statusId || 'dash-status') : null;
      this.keyboard = scene.input && scene.input.keyboard;
      this.onShift = event => {
        const target = event && event.target;
        const formFocused = target && (target.isContentEditable
          || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName || '')
          || (typeof target.closest === 'function' && target.closest('[contenteditable="true"]')));
        if (!event || event.repeat || event.ctrlKey || event.metaKey || event.altKey || formFocused) return;
        if (this.dash(this.scene.runTime) && typeof event.preventDefault === 'function') event.preventDefault();
      };
      if (this.keyboard && typeof this.keyboard.on === 'function') {
        this.boundKeys.forEach(key => this.keyboard.on(`keydown-${key}`, this.onShift));
      }
      this.renderStatus(0);
    }

    renderStatus(time) {
      if (!this.status) return;
      const remaining = Math.max(0, this.nextDashAt - time);
      const message = time < this.dashEndsAt ? 'Dashing!'
        : remaining > 0 ? `Dash ready in ${(Math.ceil(remaining / 100) / 10).toFixed(1)}s`
          : `Slice ready · ${this.label}`;
      if (this.status.textContent !== message) this.status.textContent = message;
    }

    dash(time) {
      if (this.destroyed || this.disabled || this.scene.finished || this.scene.paused
        || !Number.isFinite(time) || time < 0 || time < this.nextDashAt) return false;
      this.dashDirection = { ...this.lastDirection };
      this.dashEndsAt = time + DASH_DURATION_MS;
      this.nextDashAt = time + DASH_COOLDOWN_MS;
      this.renderStatus(time);
      this.scene.events?.emit?.('player-dash', { runnerId: this.runnerId });
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
      const dashing = time < this.dashEndsAt;
      const movement = dashing ? this.dashDirection : direction;
      const multiplier = dashing ? DASH_SPEED_MULTIPLIER : 1;
      this.renderStatus(time);
      return { x: movement.x * speed * multiplier, y: movement.y * speed * multiplier };
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      if (this.keyboard && typeof this.keyboard.off === 'function') {
        this.boundKeys.forEach(key => this.keyboard.off(`keydown-${key}`, this.onShift));
      }
    }
  }

  root.CoinDashAbilities = CoinDashAbilities;
})(typeof window !== 'undefined' ? window : globalThis);
