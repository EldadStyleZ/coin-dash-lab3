/* Round state is independent of Phaser, rendering, audio, and input. */
(function (root) {
  'use strict';
  class CoinDashRound {
    constructor(config) {
      this.duration = config.roundSeconds * 1000;
      this.levelDuration = config.levelSeconds * 1000;
      this.speedStep = config.speedStep;
      this.maxSpeedMultiplier = config.maxSpeedMultiplier;
      if (![this.duration, this.levelDuration, this.speedStep, this.maxSpeedMultiplier].every(Number.isFinite) ||
          this.duration <= 0 || this.levelDuration <= 0 || this.speedStep < 0 || this.maxSpeedMultiplier < 1) {
        throw new RangeError('Invalid round timing or difficulty settings');
      }
      this.elapsed = 0;
      this.level = 1;
      this.paused = false;
      this.finished = false;
    }
    get secondsRemaining() { return Math.max(0, Math.ceil((this.duration - this.elapsed) / 1000)); }
    get speedMultiplier() { return Math.min(this.maxSpeedMultiplier, 1 + (this.level - 1) * this.speedStep); }
    advance(delta) {
      const previousLevel = this.level;
      if (!this.paused && !this.finished && Number.isFinite(delta) && delta > 0) {
        this.elapsed = Math.min(this.duration, this.elapsed + delta);
        // The final boundary ends the round instead of spawning an unplayable level.
        this.level = Math.min(Math.ceil(this.duration / this.levelDuration), 1 + Math.floor(this.elapsed / this.levelDuration));
        if (this.elapsed >= this.duration) this.finished = true;
      }
      return { gainedLevels: this.level - previousLevel, finished: this.finished };
    }
    addTime(milliseconds) {
      if (this.finished || !Number.isFinite(milliseconds) || milliseconds <= 0) return false;
      this.duration = Math.min(Number.MAX_SAFE_INTEGER, this.duration + milliseconds);
      return true;
    }
    setPaused(paused) { if (!this.finished) this.paused = Boolean(paused); }
    finish() { this.finished = true; }
  }
  root.CoinDashRound = CoinDashRound;
})(typeof window !== 'undefined' ? window : globalThis);
