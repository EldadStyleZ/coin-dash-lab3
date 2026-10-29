/* Settings are a modal pause screen; the play surface never scrolls. */
(function (root) {
  'use strict';
  class CoinDashGameUI {
    constructor(getScene, document = root.document) {
      this.getScene = getScene;
      this.arena = document.getElementById('game');
      this.dialog = document.getElementById('settings-dialog');
      this.toggle = document.getElementById('settings-toggle');
      this.closeButton = document.getElementById('settings-close');
      this.resumeOnClose = false;
      this.toggle.addEventListener('click', () => this.isOpen() ? this.close() : this.open());
      this.closeButton.addEventListener('click', () => this.close());
      this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
      this.dialog.addEventListener('close', () => this.afterClose());
      this.arena.addEventListener('pointerdown', () => this.arena.focus({ preventScroll: true }));
    }
    isOpen() { return this.dialog.open; }
    open() {
      if (this.isOpen()) return;
      const scene = this.getScene();
      this.resumeOnClose = Boolean(scene && !scene.paused && !scene.finished);
      scene?.setPaused(true);
      this.toggle.setAttribute('aria-expanded', 'true');
      this.dialog.showModal();
      this.closeButton.focus({ preventScroll: true });
    }
    close(resume = true) {
      if (!resume) this.resumeOnClose = false;
      if (!this.isOpen()) return;
      this.dialog.close();
      // Native close events may be queued; handle focus and state immediately.
      this.afterClose();
    }
    afterClose() {
      if (this.isOpen()) return;
      this.toggle.setAttribute('aria-expanded', 'false');
      if (this.resumeOnClose) this.getScene()?.setPaused(false);
      this.resumeOnClose = false;
      this.arena.focus({ preventScroll: true });
    }
    static preventsPageScroll(event, dialogOpen) {
      if (dialogOpen || event.ctrlKey || event.metaKey || event.altKey) return false;
      const target = event.target;
      if (target?.isContentEditable || target?.closest?.('input, select, textarea, button, a, [contenteditable="true"]')) return false;
      return [' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key);
    }
  }
  root.CoinDashGameUI = CoinDashGameUI;
})(typeof window !== 'undefined' ? window : globalThis);
