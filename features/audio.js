/* Offline Web Audio: one context for the page, one disposable mixer per round. */
(function (root) {
  'use strict';
  let context = null;
  let noiseBuffer = null;
  const preferences = { music: true, sound: true, volume: 0.28 };
  const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46];
  const EFFECT_LIMIT = 8;
  const effectCosts = { shot: 1, slice: 3, whiff: 2, coin: 2, hit: 2, level: 4, angry: 3, gameover: 4 };
  const cooldowns = { shot: 100, slice: 125, whiff: 250, coin: 100, hit: 250, level: 1000, angry: 2000 };

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
    let coinNote = 0;
    let priorityUntil = -Infinity;
    const lastPlayedAt = new Map();

    function listen(element, event, callback, options) {
      element.addEventListener(event, callback, options);
      cleanups.push(() => element.removeEventListener(event, callback, options));
    }

    function release(note) {
      nodes.delete(note);
      note.oscillator.onended = null;
      try { note.oscillator.disconnect(); } catch (_) { /* Already released. */ }
      try { note.gain.disconnect(); note.filter?.disconnect(); } catch (_) { /* Already released. */ }
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

    // Hila's b19a23a synthesis, routed through our shared mute/volume mixer.
    function combatSound(slice) {
      if (!mixer || !context || context.state !== 'running') return;
      const at = context.currentTime;
      function connect(source, filter, peak, attack, decay, stop, start = at) {
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
        source.connect(filter || gain);
        if (filter) filter.connect(gain);
        gain.connect(mixer);
        const note = { oscillator: source, gain, filter, kind: 'effect' };
        nodes.add(note);
        source.onended = () => release(note);
        source.start(start);
        source.stop(start + stop);
      }
      if (!slice) {
        const source = context.createOscillator();
        source.type = 'square';
        source.frequency.setValueAtTime(880, at);
        source.frequency.exponentialRampToValueAtTime(220, at + 0.09);
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2800;
        connect(source, filter, 0.18, 0.005, 0.1, 0.11);
        return;
      }
      if (!noiseBuffer) {
        noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate / 2), context.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const noise = context.createBufferSource();
      noise.buffer = noiseBuffer;
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      const whiff = slice === 'whiff';
      band.Q.value = whiff ? 0.8 : 1.5;
      band.frequency.setValueAtTime(whiff ? 2500 : 900, at);
      band.frequency.exponentialRampToValueAtTime(whiff ? 600 : 7000, at + (whiff ? 0.2 : 0.12));
      connect(noise, band, whiff ? 0.2 : 0.36, whiff ? 0.05 : 0.04, whiff ? 0.22 : 0.18, whiff ? 0.24 : 0.2);
      if (whiff) {
        const boing = context.createOscillator();
        boing.type = 'triangle';
        boing.frequency.setValueAtTime(180, at + 0.04);
        boing.frequency.exponentialRampToValueAtTime(85, at + 0.12);
        boing.frequency.exponentialRampToValueAtTime(130, at + 0.2);
        connect(boing, null, 0.045, 0.008, 0.18, 0.2, at + 0.04);
        return;
      }
      [3150, 4730].forEach((frequency, i) => {
        const source = context.createOscillator();
        source.frequency.setValueAtTime(frequency, at + 0.07);
        source.frequency.exponentialRampToValueAtTime(frequency * 0.94, at + 0.42);
        connect(source, null, i ? 0.11 : 0.16, 0.004, 0.35, 0.36, at + 0.07);
      });
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
      if (destroyed || ended || (paused && action !== 'gameover') || !effectCosts[action]) return;
      if (action === 'gameover') {
        ended = true;
        stopMusic();
        stopNotes('effect');
      }
      if (!preferences.sound || !context || context.state !== 'running') return;
      const time = Number.isFinite(scene?.runTime) ? scene.runTime : context.currentTime * 1000;
      if (time - (lastPlayedAt.get(action) ?? -Infinity) < (cooldowns[action] || 0)) return;
      if (action === 'level' || action === 'gameover') {
        // Clear busy combat so these once-per-event jingles remain audible.
        stopNotes('effect');
        priorityUntil = time + 500;
      } else if (time < priorityUntil) return;
      const activeEffects = [...nodes].filter(note => note.kind === 'effect').length;
      if (activeEffects + effectCosts[action] > EFFECT_LIMIT) return;
      lastPlayedAt.set(action, time);
      attachMixer();
      switch (action) {
        case 'shot': combatSound(false); break;
        case 'slice': combatSound(true); break;
        case 'whiff': combatSound('whiff'); break;
        case 'coin':
          const pitch = [0.95, 1, 1.08, 1][coinNote++ % 4];
          tone(1046.5 * pitch, 0.07, 0, 'effect', 'sine', 0.14);
          tone(1568 * pitch, 0.1, 0.055, 'effect', 'sine', 0.1);
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
