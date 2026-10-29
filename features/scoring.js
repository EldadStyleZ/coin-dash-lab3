/* Browser-only scoring. All deadlines use active round time, never wall time. */
(function (root) {
  'use strict';
  const sessionBests = new Map();
  const COMBO_WINDOW_MS = 4000;
  const MESSAGE_MS = 3500;
  const validInteger = value => Number.isSafeInteger(value) && value >= 0;
  const setting = (value, fallback) => Number.isSafeInteger(value) && value > 0 ? value : fallback;

  class CoinDashScoring {
    constructor(scene) {
      this.scene = scene || {};
      const config = this.scene.config || {};
      // Snapshot initial settings: leveling must not change the comparison group.
      this.startingCreatures = setting(config.droneCount, 3);
      this.startingLives = setting(config.startingLives, 3);
      this.storageKey = `coin-dash-best:v1:drones=${this.startingCreatures}:lives=${this.startingLives}`;
      this.total = 0;
      this.coins = 0;
      this.streak = 0;
      this.combo = 1;
      this.time = 0;
      this.lastCoinTime = null;
      this.message = '';
      this.messageUntil = 0;
      this.finished = false;
      this.destroyed = false;
      this.best = this.readBest();
      this.element = root.document ? root.document.getElementById('progress-status') : null;
      this.lastRendered = '';
      if (this.element) this.element.setAttribute('aria-live', 'polite');
      this.render();
    }

    readBest() {
      let best = sessionBests.get(this.storageKey) || 0;
      try {
        const record = JSON.parse(root.localStorage.getItem(this.storageKey));
        if (record && validInteger(record.score)) best = Math.max(best, record.score);
      } catch (_) { /* Storage may be blocked or contain malformed data. */ }
      return best;
    }

    advance(time) {
      if (!Number.isFinite(time) || time < this.time || time < 0) return false;
      this.time = time;
      if (this.lastCoinTime !== null && time - this.lastCoinTime >= COMBO_WINDOW_MS) {
        this.lastCoinTime = null;
        this.streak = 0;
        this.combo = 1;
      }
      if (this.message && time >= this.messageUntil) this.message = '';
      return true;
    }

    collect(time) {
      if (this.destroyed || this.finished || this.scene.paused || !this.advance(time)) {
        return { points: 0, total: this.total, combo: this.combo };
      }
      this.lastCoinTime = time;
      this.streak++;
      // Coins 1–2: x1; coins 3–5: x2; coin 6 onward: x3.
      this.combo = this.streak >= 6 ? 3 : this.streak >= 3 ? 2 : 1;
      this.total = Math.min(Number.MAX_SAFE_INTEGER, this.total + this.combo);
      this.coins++;
      if (this.coins === 5 || this.coins === 10) {
        this.message = this.coins === 5 ? 'Achievement: first 5 coins!' : 'Achievement: 10-coin collector!';
        this.messageUntil = time + MESSAGE_MS;
      }
      this.render();
      return { points: this.combo, total: this.total, combo: this.combo };
    }

    update(time) {
      if (this.destroyed || this.finished || this.scene.paused || !this.advance(time)) return;
      this.render();
    }

    finish(score, level) {
      if (this.destroyed || this.finished) return;
      this.finished = true;
      const finalScore = validInteger(score) ? score : this.total;
      const finalLevel = setting(level, 1);
      this.total = finalScore;
      const previousBest = Math.max(this.best, this.readBest());
      this.best = Math.max(previousBest, finalScore);
      sessionBests.set(this.storageKey, this.best);
      if (finalScore >= previousBest) {
        try {
          root.localStorage.setItem(this.storageKey, JSON.stringify({ score: this.best, level: finalLevel }));
        } catch (_) { /* Keep a session best even when persistence is unavailable. */ }
      }
      const duration = this.scene.config && this.scene.config.roundSeconds;
      const survived = this.scene.round
        ? this.scene.round.secondsRemaining === 0
        : Number.isFinite(duration) && duration > 0 && this.scene.runTime >= duration * 1000;
      this.message = `${survived ? 'Achievement: round survived!' : 'Round finished'} · ${finalScore} points · level ${finalLevel}`;
      if (finalScore > previousBest) this.message += ' · New personal best!';
      this.combo = 1;
      this.streak = 0;
      this.lastCoinTime = null;
      this.render();
    }

    render() {
      if (!this.element || this.destroyed) return;
      const text = `Best: ${this.best} · Combo: ×${this.combo}` +
        (this.message ? ` · ${this.message}` : ' · Collect within 4s: 3 coins ×2, 6 coins ×3');
      // update() runs each frame; announce only actual status changes.
      if (text !== this.lastRendered) {
        this.element.textContent = text;
        this.lastRendered = text;
      }
    }

    destroy() {
      this.destroyed = true;
      this.element = null;
      this.scene = {};
    }
  }

  root.CoinDashScoring = CoinDashScoring;
})(typeof window !== 'undefined' ? window : globalThis);
