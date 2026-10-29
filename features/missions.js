/* Finite round goals. Counts come from successful gameplay actions, not timers. */
(function (root) {
  'use strict';

  class CoinDashMissions {
    constructor(scene) {
      this.scene = scene || {};
      this.destroyed = false;
      this.lastTime = 0;
      this.allComplete = false;
      this.goals = [
        { id: 'coins', label: 'Collect 5 coins', target: 5, progress: 0, complete: false, praise: 'Coin collector! Five coins collected.' },
        { id: 'dashes', label: 'Dash 3 times', target: 3, progress: 0, complete: false, praise: 'Dash master! Three successful dashes.' },
        { id: 'level', label: 'Reach level 3', target: 3, progress: 1, complete: false, praise: 'Level three reached! Keep it up.' }
      ];
      this.element = root.document ? root.document.getElementById('mission-status') : null;
      this.lastRendered = '';
      if (this.element) this.element.setAttribute('aria-live', 'polite');
      this.render();
    }

    active() {
      return !this.destroyed && !this.scene.paused && !this.scene.finished;
    }

    coin() {
      if (!this.active()) return;
      this.progress('coins', 1);
    }

    dash() {
      if (!this.active()) return;
      this.progress('dashes', 1);
    }

    progress(id, amount) {
      const goal = this.goals.find(item => item.id === id);
      if (!goal || goal.complete) return;
      goal.progress = Math.min(goal.target, goal.progress + amount);
      this.checkCompletions();
      this.render();
    }

    update(time) {
      if (!this.active() || !Number.isFinite(time) || time < this.lastTime || time < 0) return;
      this.lastTime = time;
      const goal = this.goals[2];
      if (Number.isSafeInteger(this.scene.level) && this.scene.level > 0) {
        goal.progress = Math.max(goal.progress, Math.min(goal.target, this.scene.level));
      }
      this.checkCompletions();
      this.render();
    }

    feedback(message) {
      if (typeof this.scene.reactions?.announce === 'function') this.scene.reactions.announce(message);
      if (typeof this.scene.audio?.play === 'function') this.scene.audio.play('level');
    }

    checkCompletions() {
      for (const goal of this.goals) {
        if (!goal.complete && goal.progress >= goal.target) {
          // Mark first so feedback cannot award the same completion again.
          goal.complete = true;
          this.feedback(goal.praise);
        }
      }
      if (!this.allComplete && this.goals.every(goal => goal.complete)) {
        this.allComplete = true;
        this.feedback('All three goals complete! Arena champion!');
      }
    }

    render() {
      if (!this.element || this.destroyed) return;
      const badges = this.goals.map(goal => goal.complete
        ? `✓ ${goal.label}` : `${goal.label}: ${goal.progress}/${goal.target}`);
      const text = `Round goals · ${badges.join(' · ')}` +
        (this.allComplete ? ' · ★ All goals complete!' : '');
      if (text !== this.lastRendered) {
        this.element.textContent = text;
        this.lastRendered = text;
      }
    }

    destroy() {
      this.destroyed = true;
      this.element = null;
      this.scene = null;
    }
  }

  root.CoinDashMissions = CoinDashMissions;
})(typeof window !== 'undefined' ? window : globalThis);
