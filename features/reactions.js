/* Local captions, active-time animations, and opt-in-capable offline speech. */
(function (root) {
  'use strict';
  const preferences = { voice: true, sarcasm: true };
  let gestureUnlocked = false;
  const slowComments = ['The coins are getting emotionally attached.', 'That coin has started a book club.', 'Your coin vacuum is on its lunch break.'];
  const quickComments = ['Coin vacuum: activated!', 'Your pockets have turbo mode.', 'That coin never saw you coming.', 'Caffeinated coin collector!', 'The piggy bank is doing a happy dance.'];
  const CHAIN_MILESTONES = new Set([2, 5, 10]);
  const CAPTION_COOLDOWN_MS = 3500;
  const VOICE_COOLDOWN_MS = 14000;

  class CoinDashReactions {
    constructor(scene) {
      this.scene = scene || {};
      this.time = 0;
      this.lastCoinTime = null;
      this.quickChain = 0;
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
      this.rewards = [];
      this.cleanups = [];
      this.utterance = null;
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

    speak(text) {
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
        if (this.utterance === utterance) this.utterance = null;
      };
      this.utterance = utterance;
      try {
        this.synth.speak(utterance);
        this.lastSpokenAt = this.time;
      } catch (_) { this.utterance = null; }
    }

    cancelSpeech() {
      if (!this.utterance) return;
      // No speech is queued while another utterance is active. Cancel only when
      // this module owns the current utterance, never unrelated browser speech.
      const own = this.utterance;
      this.utterance = null;
      own.onend = own.onerror = null;
      try { this.synth.cancel(); } catch (_) { /* Captions work without speech. */ }
    }

    accepts(time) {
      return !this.destroyed && !this.paused && !this.scene.paused && !this.scene.finished
        && Number.isFinite(time) && time >= this.time;
    }

    showCaption(text, tone = 'celebration') {
      if (!this.accepts(this.time) || this.time - this.lastCaptionAt < CAPTION_COOLDOWN_MS) return false;
      for (const [message, time] of this.recentCaptions) {
        if (this.time - time >= 20000) this.recentCaptions.delete(message);
      }
      if (this.recentCaptions.has(text)) return false;
      this.lastCaptionAt = this.time;
      this.recentCaptions.set(text, this.time);
      this.captionText = text;
      this.captionUntil = this.time + 2300;
      if (this.caption) {
        this.caption.textContent = text;
        this.caption.setAttribute('data-tone', tone);
        this.caption.hidden = false;
      }
      this.speak(text);
      return true;
    }

    announce(text) {
      if (!this.accepts(this.time) || typeof text !== 'string' || !text.trim()) return;
      this.showCaption(text.trim().slice(0, 140), 'achievement');
    }

    nudge() {
      if (!this.sarcasmEnabled || this.slowNudged || this.time - this.lastNudgeAt < 25000) return;
      this.slowNudged = true;
      if (this.showCaption(slowComments[this.slowIndex % slowComments.length], 'playful')) {
        this.slowIndex++;
        this.lastNudgeAt = this.time;
      }
    }

    coin(time, { points = 1, x, y, bonusSeconds = 3 } = {}) {
      if (!this.accepts(time)) return;
      this.time = time;
      const gap = this.lastCoinTime === null ? null : time - this.lastCoinTime;
      this.quickChain = gap !== null && gap < 2000 ? this.quickChain + 1 : 1;
      if (CHAIN_MILESTONES.has(this.quickChain)) {
        if (this.showCaption(quickComments[this.quickIndex % quickComments.length])) this.quickIndex++;
      } else if (gap !== null && gap >= 12000) this.nudge();
      this.lastCoinTime = time;
      this.slowNudged = false;
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
        this.captionText = '';
        if (this.caption) { this.caption.textContent = ''; this.caption.hidden = true; }
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
      this.render();
      if (time - (this.lastCoinTime === null ? 0 : this.lastCoinTime) >= 12000) this.nudge();
    }

    setPaused(paused) {
      this.paused = Boolean(paused);
      if (this.paused) this.cancelSpeech();
      if (this.layer && this.scene.finished) this.layer.hidden = true;
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
      this.recentCaptions.clear();
    }
  }
  root.CoinDashReactions = CoinDashReactions;
})(typeof window !== 'undefined' ? window : globalThis);
