/* Browser-only controls: core reads direction() and owns all game movement. */
(function (root) {
  'use strict';
  const directions = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] };
  class CoinDashTouchControls {
    constructor({ container, onStrike = () => {} } = {}) {
      this.container = container || root.document?.getElementById('touch-controls');
      this.onStrike = onStrike;
      this.pointers = new Map();
      this.keys = new Map();
      this.buttons = new Map();
      this.listeners = [];
      this.destroyed = false;
      if (!this.container) return;
      this.document = this.container.ownerDocument;
      this.window = this.document.defaultView;
      this.element = this.document.createElement('div');
      this.element.className = 'coin-touch-controls';
      this.element.setAttribute('role', 'group');
      this.element.setAttribute('aria-label', 'Touch movement and strike controls');
      const pad = this.document.createElement('div');
      pad.className = 'coin-touch-pad';
      this.element.appendChild(pad);
      for (const [action, symbol] of Object.entries({ up: '↑', left: '←', down: '↓', right: '→', strike: 'Strike ⚔' })) {
        const button = this.document.createElement('button');
        button.type = 'button';
        button.className = 'coin-touch-button coin-touch-' + action;
        button.textContent = symbol;
        button.setAttribute('aria-label', action === 'strike' ? 'Strike' : 'Move ' + action);
        button.setAttribute('aria-pressed', 'false');
        this.buttons.set(action, button);
        (action === 'strike' ? this.element : pad).appendChild(button);
        this.listen(button, 'pointerdown', event => this.pointerDown(event, action, button));
        this.listen(button, 'pointerup', event => this.pointerEnd(event));
        this.listen(button, 'pointercancel', event => this.pointerEnd(event));
        this.listen(button, 'lostpointercapture', event => this.pointerEnd(event));
        this.listen(button, 'keydown', event => this.keyDown(event, action));
        this.listen(button, 'keyup', event => this.keyUp(event));
        this.listen(button, 'blur', () => {
          for (const [key, heldAction] of this.keys) if (heldAction === action) this.keys.delete(key);
          this.refresh();
        });
        this.listen(button, 'contextmenu', event => event.preventDefault());
        // Keyboard handling prevents the native click. Assistive technology can
        // still activate Strike by dispatching a click without a pointer event.
        if (action === 'strike') this.listen(button, 'click', event => {
          if (!this.destroyed && event.detail === 0 && !this.isHeld('strike')) this.onStrike();
        });
      }
      this.container.appendChild(this.element);
      this.listen(this.window, 'pointerup', event => this.pointerEnd(event));
      this.listen(this.window, 'pointercancel', event => this.pointerEnd(event));
      this.listen(this.window, 'keyup', event => this.keyUp(event));
      this.listen(this.window, 'blur', () => this.reset());
      this.listen(this.document, 'visibilitychange', () => {
        if (this.document.hidden) this.reset();
      });
    }

    listen(target, name, handler) {
      if (!target) return;
      target.addEventListener(name, handler);
      this.listeners.push(() => target.removeEventListener(name, handler));
    }

    pointerDown(event, action, button) {
      if (this.destroyed || (event.button !== undefined && event.button !== 0)) return;
      event.preventDefault();
      if (this.pointers.has(event.pointerId)) return;
      this.pointers.set(event.pointerId, { action, button });
      try { button.setPointerCapture(event.pointerId); } catch (_) { /* Window release remains available. */ }
      this.refresh();
      if (action === 'strike') this.onStrike();
    }

    pointerEnd(event) {
      const held = this.pointers.get(event.pointerId);
      if (!held) return;
      // Delete first because releasing capture may immediately dispatch lostcapture.
      this.pointers.delete(event.pointerId);
      try {
        if (held.button.hasPointerCapture(event.pointerId)) held.button.releasePointerCapture(event.pointerId);
      } catch (_) { /* Pointer may already have been cancelled by the browser. */ }
      this.refresh();
    }

    activationKey(event) {
      if (event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar') return 'Space';
      if (event.code === 'Enter' || event.code === 'NumpadEnter' || event.key === 'Enter') return event.code || 'Enter';
      return null;
    }

    keyDown(event, action) {
      const key = this.activationKey(event);
      if (!key || this.destroyed) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || this.keys.has(key)) return;
      this.keys.set(key, action);
      this.refresh();
      if (action === 'strike') this.onStrike();
    }

    keyUp(event) {
      const key = this.activationKey(event);
      if (!key || !this.keys.has(key)) return;
      event.preventDefault();
      this.keys.delete(key);
      this.refresh();
    }

    isHeld(action) {
      return [...this.pointers.values()].some(value => value.action === action)
        || [...this.keys.values()].includes(action);
    }

    direction() {
      if (this.destroyed) return { x: 0, y: 0 };
      let x = 0, y = 0;
      for (const [action, vector] of Object.entries(directions)) {
        if (this.isHeld(action)) { x += vector[0]; y += vector[1]; }
      }
      return { x, y };
    }

    refresh() {
      for (const [action, button] of this.buttons) button.setAttribute('aria-pressed', String(this.isHeld(action)));
    }

    reset() {
      const heldPointers = [...this.pointers.entries()];
      this.pointers.clear();
      this.keys.clear();
      for (const [id, held] of heldPointers) {
        try { if (held.button.hasPointerCapture(id)) held.button.releasePointerCapture(id); } catch (_) { /* Already released. */ }
      }
      this.refresh();
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.reset();
      this.listeners.splice(0).forEach(remove => remove());
      this.element?.remove();
      this.buttons.clear();
      this.onStrike = () => {};
    }
  }
  root.CoinDashTouchControls = CoinDashTouchControls;
  if (typeof module !== 'undefined' && module.exports) module.exports = CoinDashTouchControls;
}(typeof window !== 'undefined' ? window : globalThis));
