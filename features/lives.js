(function (root) {
  'use strict';

  function boundedNumber(value, fallback, minimum, maximum) {
    if (value === undefined || value === null || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.min(maximum, Math.max(minimum, Math.floor(number)))
      : fallback;
  }

  // Time is supplied by the scene's active-round clock, so pausing also pauses
  // immunity. No wall-clock timers survive a scene restart.
  class LifeState {
    constructor(options = {}) {
      this.maxLives = boundedNumber(options.maxLives, 3, 1, 9);
      this.invulnerabilityMs = boundedNumber(options.invulnerabilityMs, 1500, 0, 10000);
      this.remaining = this.maxLives;
      this.immuneUntil = 0;
    }

    isInvulnerable(time) {
      return this.remaining > 0 && Number.isFinite(time) && time < this.immuneUntil;
    }

    hit(time) {
      const validTime = Number.isFinite(time) && time >= 0;
      const damaged = validTime && this.remaining > 0 && !this.isInvulnerable(time);
      if (damaged) {
        this.remaining -= 1;
        this.immuneUntil = time + this.invulnerabilityMs;
      }
      return { damaged, dead: this.remaining === 0, remaining: this.remaining };
    }
  }

  function create(scene, options = {}) {
    const state = new LifeState(options);
    const player = scene.player;
    const initialAlpha = player && Number.isFinite(player.alpha) ? player.alpha : 1;
    const status = typeof document !== 'undefined'
      ? document.getElementById(options.statusId || 'lives-status') : null;
    let destroyed = false;

    function setAlpha(alpha) {
      if (!player) return;
      if (typeof player.setAlpha === 'function') player.setAlpha(alpha);
      else player.alpha = alpha;
    }

    function renderStatus() {
      if (!status) return;
      const hearts = '♥'.repeat(state.remaining) + '♡'.repeat(state.maxLives - state.remaining);
      status.textContent = `${hearts} ${state.remaining} / ${state.maxLives}`;
      status.setAttribute('aria-label', `${state.remaining} of ${state.maxLives} lives remaining`);
    }

    function update(time) {
      if (destroyed) return;
      const blinking = state.isInvulnerable(time) && Math.floor(time / 100) % 2 === 0;
      setAlpha(blinking ? initialAlpha * 0.35 : initialAlpha);
    }

    renderStatus();
    return {
      get remaining() { return state.remaining; },
      hit(time) {
        if (destroyed) return { damaged: false, dead: state.remaining === 0, remaining: state.remaining };
        const result = state.hit(time);
        if (result.damaged) renderStatus();
        update(time);
        return result;
      },
      update,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        setAlpha(initialAlpha);
      }
    };
  }

  root.CoinDashLives = { create, LifeState };
})(typeof window !== 'undefined' ? window : globalThis);
