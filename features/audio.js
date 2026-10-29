/* Offline Web Audio: one context for the page, one disposable mixer per round. */
(function (root) {
  'use strict';
  let context = null;
  const preferences = { music: true, sound: true, volume: 0.28 };
  const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46];

  function create(scene) {
    const doc = root.document;
    const container = doc && doc.getElementById('audio-controls');
    const AudioContext = root.AudioContext || root.webkitAudioContext;
    const nodes = new Set();
    const cleanups = [];
    let mixer = null;
    let timer = null;
    let beat = 0;
    let paused = false;
    let ended = false;
    let destroyed = false;
    let unlocking = false;
    let status = null;

    function listen(element, event, callback, options) {
      element.addEventListener(event, callback, options);
      cleanups.push(() => element.removeEventListener(event, callback, options));
    }

    function release(note) {
      nodes.delete(note);
      note.oscillator.onended = null;
      try { note.oscillator.disconnect(); } catch (_) { /* Already released. */ }
      try { note.gain.disconnect(); } catch (_) { /* Already released. */ }
    }

    function stopNotes(kind) {
      for (const note of Array.from(nodes)) {
        if (kind && note.kind !== kind) continue;
        try { note.oscillator.stop(); } catch (_) { /* Already ended. */ }
        release(note);
      }
    }

    function attachMixer() {
      if (mixer || !context) return;
      mixer = context.createGain();
      mixer.gain.value = preferences.volume;
      mixer.connect(context.destination);
    }

    function tone(frequency, duration, offset, kind, type, level) {
      if (destroyed || !mixer || context.state !== 'running') return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const note = { oscillator, gain, kind };
      const at = context.currentTime + (offset || 0);
      oscillator.type = type || 'sine';
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(level || 0.12, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
      oscillator.connect(gain);
      gain.connect(mixer);
      nodes.add(note);
      oscillator.onended = () => release(note);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.02);
    }

    function stopMusic() {
      if (timer !== null) root.clearInterval(timer);
      timer = null;
      stopNotes('music');
    }

    function startMusic() {
      if (timer !== null || destroyed || paused || ended || !preferences.music ||
          !context || context.state !== 'running') return;
      attachMixer();
      const tick = () => {
        if (destroyed || paused || ended || context.state !== 'running') return;
        tone(melody[beat % melody.length], 0.16, 0, 'music', 'triangle', 0.11);
        if (beat % 2 === 0) tone(beat % 8 < 4 ? 130.81 : 146.83, 0.3, 0, 'music', 'sine', 0.16);
        beat++;
      };
      tick();
      timer = root.setInterval(tick, 225);
    }

    async function unlock(event) {
      if (destroyed || unlocking || (event && event.isTrusted === false)) return;
      unlocking = true;
      try {
        if (!context) context = new AudioContext();
        if (context.state !== 'running') await context.resume();
        if (destroyed) return;
        attachMixer();
        if (status) status.textContent = context.state === 'running' ? 'Audio ready' : 'Tap or press a key to enable audio';
        startMusic();
      } catch (_) {
        if (status && !destroyed) status.textContent = 'Audio unavailable — you can still play';
      } finally {
        unlocking = false;
      }
    }

    function play(action) {
      if (destroyed || (paused && action !== 'gameover')) return;
      if (action === 'gameover') {
        ended = true;
        stopMusic();
      }
      if (!preferences.sound || !context || context.state !== 'running') return;
      attachMixer();
      switch (action) {
        case 'coin':
          tone(1046.5, 0.08, 0, 'effect', 'sine', 0.24);
          tone(1568, 0.12, 0.065, 'effect', 'sine', 0.18);
          break;
        case 'hit':
          tone(164.81, 0.16, 0, 'effect', 'sawtooth', 0.13);
          tone(82.41, 0.2, 0.08, 'effect', 'triangle', 0.2);
          break;
        case 'level':
          [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.18, i * 0.09, 'effect', 'triangle', 0.22));
          break;
        case 'angry':
          tone(110, 0.22, 0, 'effect', 'sawtooth', 0.16);
          tone(73.42, 0.28, 0.12, 'effect', 'triangle', 0.2);
          tone(55, 0.3, 0.23, 'effect', 'sawtooth', 0.1);
          break;
        case 'gameover':
          [392, 329.63, 261.63, 130.81].forEach((f, i) => tone(f, 0.25, i * 0.13, 'effect', 'triangle', 0.2));
          break;
        default: break;
      }
    }

    function setPaused(value) {
      paused = Boolean(value);
      if (paused) {
        stopMusic();
        if (!ended) stopNotes();
      } else startMusic();
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stopMusic();
      stopNotes();
      cleanups.forEach(cleanup => cleanup());
      if (mixer) mixer.disconnect();
      mixer = null;
      if (scene && scene.events && scene.events.off) scene.events.off('shutdown', destroy);
      // The context stays available for the next round; all round nodes are released.
    }

    if (container) {
      container.replaceChildren();
      status = doc.createElement('span');
      status.className = 'audio-status';
      status.setAttribute('role', 'status');
      status.textContent = AudioContext ? 'Tap or press a key to enable audio' : 'Audio unavailable in this browser';
      const addToggle = (key, text) => {
        const label = doc.createElement('label');
        const input = doc.createElement('input');
        input.type = 'checkbox';
        input.checked = preferences[key];
        label.append(input, doc.createTextNode(' ' + text));
        container.append(label);
        listen(input, 'change', () => {
          preferences[key] = input.checked;
          if (key === 'music') {
            if (input.checked) startMusic();
            else stopMusic();
          } else if (!input.checked) stopNotes('effect');
        });
        input.disabled = !AudioContext;
      };
      addToggle('music', 'Music');
      addToggle('sound', 'Sound effects');
      const label = doc.createElement('label');
      const volume = doc.createElement('input');
      volume.type = 'range';
      volume.min = '0';
      volume.max = '100';
      volume.step = '1';
      volume.value = String(Math.round(preferences.volume * 100));
      volume.setAttribute('aria-label', 'Audio volume');
      volume.disabled = !AudioContext;
      label.append(doc.createTextNode('Volume '), volume);
      container.append(label, status);
      listen(volume, 'input', () => {
        preferences.volume = Math.max(0, Math.min(1, Number(volume.value) / 100));
        if (mixer) mixer.gain.setTargetAtTime(preferences.volume, context.currentTime, 0.02);
      });
    }

    if (AudioContext && doc) {
      listen(doc, 'pointerdown', unlock, true);
      listen(doc, 'keydown', unlock, true);
      // A previous round may already have unlocked the shared context.
      if (context && context.state === 'running') {
        attachMixer();
        if (status) status.textContent = 'Audio ready';
        startMusic();
      }
    }
    if (scene && scene.events && scene.events.once) scene.events.once('shutdown', destroy);
    return { play, setPaused, destroy };
  }

  root.CoinDashAudio = { create };
})(typeof window !== 'undefined' ? window : globalThis);
