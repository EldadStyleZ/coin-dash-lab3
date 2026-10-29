/* Local captions, active-time animations, and opt-in-capable offline speech. */
(function (root) {
  'use strict';
  const preferences = { voice: true, sarcasm: true };
  let gestureUnlocked = false;
  const slowComments = ['The coins are getting emotionally attached.', 'That coin has started a book club.', 'Your coin vacuum is on its lunch break.'];
  const quickComments = ['Coin vacuum: activated!', 'Your pockets have turbo mode.', 'That coin never saw you coming.', 'Caffeinated coin collector!', 'The piggy bank is doing a happy dance.'];
  const CHAIN_MILESTONES = new Set([3, 6, 10]);
  const KILL_MILESTONES = new Set([2, 3, 5]);
  const CAPTION_COOLDOWN_MS = 3500;
  const VOICE_COOLDOWN_MS = 14000;

  class CoinDashReactions {
    constructor(scene) {
      this.scene = scene || {};
      this.time = 0;
      this.performance = new Map();
      this.lastSuccessTime = 0;
      this.slowNudged = false;
      this.slowIndex = 0;
      this.quickIndex = 0;
      this.lastNudgeAt = -Infinity;
      this.lastCaptionAt = -Infinity;
      this.recentCaptions = new Map();
      this.paused = false;
      this.destroyed = false;
      this.voiceEnabled = preferences.voice;
      this.sarcasmEnabled = preferences.sarcasm;
      this.lastSpokenAt = -Infinity;
      this.captionText = '';
      this.captionUntil = 0;
      this.captionMeta = null;
      this.rewards = [];
      this.cleanups = [];
      this.utterance = null;
      this.utteranceMeta = null;
      this.voice = null;
      this.synth = root.speechSynthesis;
      this.doc = root.document;
      this.reducedMotion = Boolean(root.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      this.makeUi();
      this.refreshVoice();
      if (this.doc) {
        const unlock = event => { if (event.isTrusted === true) gestureUnlocked = true; };
        this.listen(this.doc, 'pointerdown', unlock, true);
        this.listen(this.doc, 'keydown', unlock, true);
      }
      if (this.synth && typeof this.synth.addEventListener === 'function') {
        this.listen(this.synth, 'voiceschanged', () => this.refreshVoice());
      }
      if (this.scene.events?.on && this.scene.events?.off) {
        const events = this.scene.events;
        const listen = (name, callback) => {
          events.on(name, callback);
          this.cleanups.push(() => events.off(name, callback));
        };
        listen('enemy-killed', event => this.killed(event || {}));
        listen('strike-missed', event => this.failed(event || {}));
        listen('player-hit', event => { if (event?.damaged === true) this.failed(event); });
      }
    }

    // Legacy P1 readouts remain useful to core diagnostics; gameplay state is
    // per runner, so alternating P1/P2 collections never form a shared streak.
    get quickChain() { return this.performance.get('p1')?.coinCount || 0; }
    get lastCoinTime() { return this.performance.get('p1')?.lastCoinTime ?? null; }

    runnerState(runnerId) {
      if (runnerId !== 'p1' && runnerId !== 'p2') return null;
      if (!this.performance.has(runnerId)) this.performance.set(runnerId, {
        coinCount: 0, lastCoinTime: null, killCount: 0, lastKillTime: null
      });
      return this.performance.get(runnerId);
    }

    clearCaption() {
      this.captionText = '';
      this.captionMeta = null;
      if (this.caption) { this.caption.textContent = ''; this.caption.hidden = true; }
    }

    clearMatching(matches) {
      if (this.captionMeta && matches(this.captionMeta)) this.clearCaption();
      if (this.utteranceMeta && matches(this.utteranceMeta)) this.cancelSpeech();
    }

    clearPerformance(runnerId, kind) {
      this.clearMatching(meta => meta.runnerId === runnerId
        && (meta.kind === 'coin' || meta.kind === 'kill') && (!kind || meta.kind === kind));
    }

    expireStreaks() {
      for (const [runnerId, state] of this.performance) {
        if (state.lastCoinTime !== null && this.time - state.lastCoinTime >= 2000) {
          state.coinCount = 0;
          state.lastCoinTime = null;
          this.clearPerformance(runnerId, 'coin');
        }
        if (state.lastKillTime !== null && this.time - state.lastKillTime >= 2500) {
          state.killCount = 0;
          state.lastKillTime = null;
          this.clearPerformance(runnerId, 'kill');
        }
      }
    }

    success() {
      this.lastSuccessTime = this.time;
      this.slowNudged = false;
      this.clearMatching(meta => meta.kind === 'idle');
    }

    failed({ runnerId = 'p1', time = this.scene.runTime } = {}) {
      if (!this.accepts(time)) return;
      const state = this.runnerState(runnerId);
      if (!state) return;
      this.time = time;
      this.expireStreaks();
      state.coinCount = state.killCount = 0;
      state.lastCoinTime = state.lastKillTime = null;
      this.clearPerformance(runnerId);
    }

    killed({ runnerId = 'p1', time, cause, count } = {}) {
      if (!this.accepts(time) || !['enemy', 'shot'].includes(cause)
        || !Number.isSafeInteger(count) || count < 1) return;
      const state = this.runnerState(runnerId);
      if (!state || (state.lastKillTime === time && state.killCount === count)) return;
      this.time = time;
      this.expireStreaks();
      if (count <= state.killCount) this.clearPerformance(runnerId, 'kill');
      state.killCount = count;
      state.lastKillTime = time;
      this.success();
      if (KILL_MILESTONES.has(count)) {
        const joke = count === 2 ? 'Double cleanup!' : count === 3 ? 'The swarm is reconsidering.' : 'Swarm meeting postponed.';
        this.showCaption(`${runnerId.toUpperCase()}: ${count} kill chain! ${joke}`, 'celebration', { kind: 'kill', runnerId });
      }
      this.render();
    }

    listen(target, name, callback, options) {
      target.addEventListener(name, callback, options);
      this.cleanups.push(() => target.removeEventListener(name, callback, options));
    }

    makeUi() {
      if (!this.doc) return;
      this.overlay = this.doc.getElementById('reaction-overlay');
      if (this.overlay) {
        this.layer = this.doc.createElement('div');
        this.layer.className = 'coin-reactions-layer';
        this.caption = this.doc.createElement('div');
        this.caption.className = 'reaction-caption';
        this.caption.setAttribute('role', 'status');
        this.caption.setAttribute('aria-live', 'polite');
        this.caption.hidden = true;
        this.layer.appendChild(this.caption);
        this.overlay.appendChild(this.layer);
      }
      const container = this.doc.getElementById('reaction-controls');
      if (!container) return;
      this.controls = this.doc.createElement('div');
      this.controls.className = 'reaction-options';
      const toggle = (text, property, preference) => {
        const label = this.doc.createElement('label');
        const input = this.doc.createElement('input');
        input.type = 'checkbox';
        input.checked = this[property];
        label.appendChild(input);
        label.appendChild(this.doc.createTextNode(' ' + text));
        this.controls.appendChild(label);
        this.listen(input, 'change', () => {
          this[property] = input.checked;
          preferences[preference] = input.checked;
          if (property === 'voiceEnabled' && !input.checked) this.cancelSpeech();
        });
      };
      toggle('Voice reactions', 'voiceEnabled', 'voice');
      toggle('Playful nudges', 'sarcasmEnabled', 'sarcasm');
      this.voiceStatus = this.doc.createElement('span');
      this.voiceStatus.className = 'reaction-voice-status';
      this.controls.appendChild(this.voiceStatus);
      container.appendChild(this.controls);
    }

    refreshVoice() {
      try {
        const local = this.synth?.getVoices().filter(voice => voice.localService === true) || [];
        this.voice = local.find(voice => /^en(?:-|$)/i.test(voice.lang)) || local[0] || null;
      } catch (_) { this.voice = null; }
      if (this.voiceStatus) this.voiceStatus.textContent = this.voice
        ? 'Offline voice · starts after a tap or keypress'
        : 'Captions ready · no local voice available';
    }

    speak(text, meta = { kind: 'announcement' }) {
      if (!this.voiceEnabled || !gestureUnlocked || !this.voice || !this.synth
        || typeof root.SpeechSynthesisUtterance !== 'function' || this.paused
        || this.scene.finished || this.destroyed || this.time - this.lastSpokenAt < VOICE_COOLDOWN_MS
        || this.utterance || this.synth.speaking || this.synth.pending) return;
      const utterance = new root.SpeechSynthesisUtterance(text);
      utterance.voice = this.voice; // Never choose an online/browser default voice.
      utterance.lang = this.voice.lang;
      utterance.rate = 1.08;
      utterance.pitch = 1.12;
      utterance.volume = 0.55;
      utterance.onend = utterance.onerror = () => {
        if (this.utterance === utterance) { this.utterance = null; this.utteranceMeta = null; }
      };
      this.utterance = utterance;
      this.utteranceMeta = meta;
      try {
        this.synth.speak(utterance);
        this.lastSpokenAt = this.time;
      } catch (_) { this.utterance = null; this.utteranceMeta = null; }
    }

    cancelSpeech() {
      if (!this.utterance) return;
      // No speech is queued while another utterance is active. Cancel only when
      // this module owns the current utterance, never unrelated browser speech.
      const own = this.utterance;
      this.utterance = null;
      this.utteranceMeta = null;
      own.onend = own.onerror = null;
      try { this.synth.cancel(); } catch (_) { /* Captions work without speech. */ }
    }

    accepts(time) {
      return !this.destroyed && !this.paused && !this.scene.paused && !this.scene.finished
        && Number.isFinite(time) && time >= this.time;
    }

    showCaption(text, tone = 'celebration', meta = { kind: 'announcement' }) {
      if (!this.accepts(this.time) || this.time - this.lastCaptionAt < CAPTION_COOLDOWN_MS) return false;
      for (const [message, time] of this.recentCaptions) {
        if (this.time - time >= 20000) this.recentCaptions.delete(message);
      }
      if (this.recentCaptions.has(text)) return false;
      this.lastCaptionAt = this.time;
      this.recentCaptions.set(text, this.time);
      this.captionText = text;
      this.captionMeta = meta;
      this.captionUntil = this.time + 2300;
      if (this.caption) {
        this.caption.textContent = text;
        this.caption.setAttribute('data-tone', tone);
        this.caption.hidden = false;
      }
      this.speak(text, meta);
      return true;
    }

    announce(text) {
      if (!this.accepts(this.time) || typeof text !== 'string' || !text.trim()) return;
      this.showCaption(text.trim().slice(0, 140), 'achievement');
    }

    nudge() {
      if (!this.sarcasmEnabled || this.slowNudged || this.time - this.lastNudgeAt < 25000) return;
      this.slowNudged = true;
      if (this.showCaption(slowComments[this.slowIndex % slowComments.length], 'playful', { kind: 'idle' })) {
        this.slowIndex++;
        this.lastNudgeAt = this.time;
      }
    }

    coin(time, { points = 1, x, y, bonusSeconds = 3, runnerId = 'p1' } = {}) {
      if (!this.accepts(time)) return;
      this.time = time;
      this.expireStreaks();
      this.success();
      const state = this.runnerState(runnerId);
      if (state) {
        state.coinCount++;
        state.lastCoinTime = time;
        if (CHAIN_MILESTONES.has(state.coinCount)) {
          const text = `${runnerId.toUpperCase()}: ${state.coinCount} quick coins! ${quickComments[this.quickIndex % quickComments.length]}`;
          if (this.showCaption(text, 'celebration', { kind: 'coin', runnerId })) this.quickIndex++;
        }
      }
      this.addReward({ points, x, y, bonusSeconds });
      this.render();
    }

    addReward({ points, x, y, bonusSeconds }) {
      const safePoints = Number.isFinite(points) && points >= 0 ? points : 1;
      const safeBonus = Number.isFinite(bonusSeconds) && bonusSeconds >= 0 ? bonusSeconds : 3;
      let node = null;
      if (this.layer) {
        node = this.doc.createElement('span');
        node.className = 'reaction-reward';
        node.textContent = `+${safePoints} ${safePoints === 1 ? 'point' : 'points'} · +${safeBonus}s`;
        node.setAttribute('aria-hidden', 'true');
        const width = this.scene.config?.width || 800;
        const height = this.scene.config?.height || 500;
        const px = Number.isFinite(x) ? x : width / 2;
        const py = Number.isFinite(y) ? y : height / 2;
        const canvasRect = this.scene.game?.canvas?.getBoundingClientRect?.();
        const overlayRect = this.overlay.getBoundingClientRect();
        const left = canvasRect && overlayRect.width > 0
          ? (canvasRect.left - overlayRect.left + px / width * canvasRect.width) / overlayRect.width
          : px / width;
        const top = canvasRect && overlayRect.height > 0
          ? (canvasRect.top - overlayRect.top + py / height * canvasRect.height) / overlayRect.height
          : py / height;
        node.style.left = `${Math.min(0.87, Math.max(0.13, left)) * 100}%`;
        node.style.top = `${Math.min(0.93, Math.max(0.1, top)) * 100}%`;
        this.layer.appendChild(node);
      }
      this.rewards.push({ node, start: this.time });
      while (this.rewards.length > 6) this.rewards.shift().node?.remove();
    }

    render() {
      if (this.captionText && this.time >= this.captionUntil) {
        this.clearCaption();
      }
      this.rewards = this.rewards.filter(reward => {
        const progress = (this.time - reward.start) / 1100;
        if (progress >= 1) { reward.node?.remove(); return false; }
        // Quantize to about 60 visual steps; repeated updates at the same active
        // time (and every reduced-motion frame) need no additional style writes.
        const step = this.reducedMotion ? 0 : Math.floor(progress * 60);
        if (reward.node && reward.step !== step) {
          reward.step = step;
          reward.node.style.opacity = this.reducedMotion ? '1' : String(1 - step / 60);
          reward.node.style.transform = `translate(-50%, calc(-50% - ${this.reducedMotion ? 0 : step / 60 * 24}px))`;
        }
        return true;
      });
    }

    update(time) {
      if (this.scene.finished) { this.setPaused(true); return; }
      if (!this.accepts(time)) return;
      this.time = time;
      this.expireStreaks();
      this.render();
      if (time - this.lastSuccessTime >= 12000) this.nudge();
    }

    setPaused(paused) {
      this.paused = Boolean(paused);
      if (this.paused) this.cancelSpeech();
      if (this.scene.finished) {
        this.performance.clear();
        this.clearCaption();
        if (this.layer) this.layer.hidden = true;
      }
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.cancelSpeech();
      this.cleanups.splice(0).forEach(cleanup => cleanup());
      this.rewards.forEach(reward => reward.node?.remove());
      this.rewards = [];
      this.layer?.remove();
      this.controls?.remove();
      this.captionText = '';
      this.captionMeta = null;
      this.performance.clear();
      this.recentCaptions.clear();
    }
  }
  root.CoinDashReactions = CoinDashReactions;
})(typeof window !== 'undefined' ? window : globalThis);
