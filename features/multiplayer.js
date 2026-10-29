/* Hila's local multiplayer mode, adapted to the shared lives and ability modules. */
(function (root) {
  'use strict';

  const PLAYER_TWO_COLOR = 0x69aaff;
  const OUT_COLOR = 0x687384;
  const down = key => Boolean(key && key.isDown);

  function editingForm() {
    const target = typeof document !== 'undefined' ? document.activeElement : null;
    return Boolean(target && (target.isContentEditable
      || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName || '')
      || target.closest?.('[contenteditable="true"]')));
  }

  function stop(runner) {
    runner.player.body?.setVelocity(0, 0);
  }

  class CoinDashMultiplayer {
    constructor(scene) {
      this.scene = scene;
      this.destroyed = false;
      this.paused = false;
      this.collider = null;
      this.status = typeof document !== 'undefined' ? document.getElementById('multiplayer-status') : null;
      this.secondPlayerStatus = typeof document === 'undefined' ? []
        : ['p2-lives-status', 'p2-dash-status'].map(id => document.getElementById(id))
          .filter(Boolean).map(node => ({ node, hidden: node.hidden }));
      this.secondPlayerStatus.forEach(({ node }) => { node.hidden = Number(scene.config.playerCount) !== 2; });
      this.runners = [{ id: 'p1', player: scene.player, abilities: scene.abilities,
        lives: scene.lives, score: 0, out: false }];
      scene.player.setData?.('playerId', 'p1');

      if (Number(scene.config.playerCount) === 2) {
        scene.player.body.reset(360, 250);
        const player = root.CoinDashVisuals
          ? root.CoinDashVisuals.createPlayer(scene, 440, 250)
          : scene.add.rectangle(440, 250, 24, 24, PLAYER_TWO_COLOR);
        player.setTint?.(PLAYER_TWO_COLOR);
        player.setData?.('playerId', 'p2');
        scene.physics.add.existing(player);
        player.body.setSize(player.width * 0.7, player.height * 0.7, true)
          .setCollideWorldBounds(true);
        const runner = { id: 'p2', player, abilities: null, lives: null, score: 0, out: false };
        // Read live scene state through the prototype: pause/time/restart state
        // must never be copied into an independent second clock.
        const facade = Object.create(scene);
        facade.player = player;
        Object.defineProperty(facade, 'finished', { get: () => scene.finished || runner.out });
        runner.abilities = new root.CoinDashAbilities(facade, {
          keys: ['ENTER'], statusId: 'p2-dash-status', label: 'Enter', runnerId: 'p2'
        });
        runner.lives = root.CoinDashLives.create(facade, {
          maxLives: scene.config.startingLives,
          invulnerabilityMs: scene.config.invulnerabilityMs,
          statusId: 'p2-lives-status'
        });
        this.runners.push(runner);
        if (scene.arena?.obstacles) {
          this.collider = scene.physics.add.collider(player, scene.arena.obstacles);
        }
      }
      this.render();
    }

    getRunners() {
      return this.destroyed ? [] : this.runners.filter(runner => !runner.out);
    }

    getRunner(id = 'p1') {
      return this.runners.find(runner => runner.id === id);
    }

    record(points, id = 'p1') {
      const runner = this.getRunner(id);
      if (!runner) return 0;
      if (!this.destroyed && !this.paused && !this.scene.paused && !this.scene.finished
        && !runner.out && Number.isFinite(points) && points > 0) {
        runner.score += points;
        this.render();
      }
      return runner.score;
    }

    hit(runner, time) {
      if (!this.runners.includes(runner)) return { damaged: false, dead: false, remaining: 0,
        allOut: this.runners.every(player => player.out) };
      let result = { damaged: false, dead: runner.out, remaining: runner.lives.remaining };
      if (!this.destroyed && !this.paused && !this.scene.paused && !this.scene.finished && !runner.out) {
        result = runner.lives.hit(time);
        if (result.dead) {
          runner.out = true;
          runner.abilities.disabled = true;
          stop(runner);
          if (runner.player.body) runner.player.body.enable = false;
          if (runner.player.setTint) runner.player.setTint(OUT_COLOR);
          else runner.player.setFillStyle?.(OUT_COLOR);
          runner.player.setAlpha(0.45);
          this.render();
        }
      }
      return { ...result, allOut: this.runners.every(player => player.out) };
    }

    update(time, delta) {
      if (this.destroyed) return;
      if (this.paused || this.scene.paused || this.scene.finished) {
        this.runners.forEach(stop);
        return;
      }
      const keys = this.scene.keys || {};
      const arrows = this.scene.cursors || {};
      const editing = editingForm();
      const touch = this.scene.touch?.direction() || { x: 0, y: 0 };
      for (const runner of this.runners) {
        if (runner.out) { stop(runner); continue; }
        let dx = 0;
        let dy = 0;
        if (!editing) {
          const primary = runner.id === 'p1';
          const useArrows = !primary || this.runners.length === 1;
          dx = Number((primary && down(keys.D)) || (useArrows && down(arrows.right)))
            - Number((primary && down(keys.A)) || (useArrows && down(arrows.left)));
          dy = Number((primary && down(keys.S)) || (useArrows && down(arrows.down)))
            - Number((primary && down(keys.W)) || (useArrows && down(arrows.up)));
        }
        if (runner.id === 'p1') {
          dx += Number.isFinite(touch.x) ? touch.x : 0;
          dy += Number.isFinite(touch.y) ? touch.y : 0;
        }
        const velocity = runner.abilities.velocity(dx, dy, time);
        const boost = this.scene.powerups?.speedMultiplier?.(time, runner.id) ?? 1;
        const multiplier = Number.isFinite(boost) && boost >= 0 ? boost : 1;
        runner.player.body?.setVelocity(velocity.x * multiplier, velocity.y * multiplier);
        runner.lives.update(time);
      }
    }

    setPaused(paused) {
      this.paused = Boolean(paused);
      if (this.paused) this.runners.forEach(stop);
    }

    summary() {
      const [p1, p2] = this.runners;
      if (!p2) return `${p1.score} points`;
      const winner = p1.score === p2.score ? 'Draw!' : p1.score > p2.score ? 'P1 wins!' : 'P2 wins!';
      return `P1: ${p1.score} · P2: ${p2.score} — ${winner}`;
    }

    render() {
      if (!this.status || this.destroyed) return;
      const scores = this.runners.map(runner => `${runner.id.toUpperCase()}: ${runner.score}${runner.out ? ' OUT' : ''}`);
      const text = `${this.runners.length}P · ${scores.join(' · ')}`;
      if (this.status.textContent !== text) this.status.textContent = text;
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.collider?.destroy();
      this.collider = null;
      const p2 = this.getRunner('p2');
      if (p2) {
        p2.abilities.destroy();
        p2.lives.destroy();
        p2.player.destroy();
      }
      // The scene owns P1's sprite, abilities and lives, including their cleanup.
      this.secondPlayerStatus.forEach(({ node, hidden }) => { node.hidden = hidden; });
      this.secondPlayerStatus = [];
      this.status = null;
    }
  }

  root.CoinDashMultiplayer = CoinDashMultiplayer;
})(typeof window !== 'undefined' ? window : globalThis);
