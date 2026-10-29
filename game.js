/* global Phaser, COIN_DASH */
(() => {
  const el = id => document.getElementById(id);
  const setText = (id, value) => { const node = el(id); const text = String(value); if (node.textContent !== text) node.textContent = text; };
  const clampInteger = (value, fallback, min, max) => {
    const number = Number(value);
    return Number.isFinite(number) && String(value).trim() !== ''
      ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
  };
  try {
    const saved = JSON.parse(localStorage.getItem('coin-dash-settings') || 'null');
    if (saved) {
      el('creature-count').value = clampInteger(saved.droneCount, 3, 1, COIN_DASH.maxStartingDrones);
      if ([1, 3, 5].includes(saved.startingLives)) el('starting-lives').value = saved.startingLives;
      if (['easy', 'normal', 'hard'].includes(saved.difficulty)) el('difficulty').value = saved.difficulty;
      el('player-count').value = saved.playerCount === 2 ? '2' : '1';
    }
  } catch { /* Private browsing or malformed saved settings: use defaults. */ }

  class CoinDash extends Phaser.Scene {
    constructor() { super('CoinDash'); }
    create() {
      const droneCount = clampInteger(el('creature-count').value, COIN_DASH.droneCount, 1, COIN_DASH.maxStartingDrones);
      const selectedLives = Number(el('starting-lives').value);
      const startingLives = [1, 3, 5].includes(selectedLives) ? selectedLives : COIN_DASH.startingLives;
      const difficulty = el('difficulty').value;
      const playerCount = Number(el('player-count').value) === 2 ? 2 : 1;
      this.config = window.CoinDashDifficulty.apply({ ...COIN_DASH, droneCount, startingLives, playerCount }, difficulty);
      const c = this.config;
      el('creature-count').value = droneCount;
      try { localStorage.setItem('coin-dash-settings', JSON.stringify({ droneCount, startingLives, difficulty, playerCount })); } catch { /* Optional persistence. */ }
      this.score = 0;
      this.level = 1;
      this.runTime = 0;
      this.round = new window.CoinDashRound(c);
      this.finished = false;
      this.paused = false;
      this.players = null;
      this.physics.resume();
      this.physics.world.setBounds(16, 44, c.width - 32, c.height - 60);
      this.arena = new window.CoinDashArena(this);
      this.add.text(22, 13, 'COLLECT / EVADE / SURVIVE', { font: '12px monospace', color: '#8dabc9' });
      this.levelHint = this.add.text(c.width - 22, 13, '', { font: '12px monospace', color: '#71e8ce' }).setOrigin(1, 0);
      const visuals = window.CoinDashVisuals;
      if (visuals) visuals.prepare(this);
      this.player = visuals ? visuals.createPlayer(this, c.width / 2, c.height / 2)
        : this.add.rectangle(c.width / 2, c.height / 2, 24, 24, c.colors.player);
      this.physics.add.existing(this.player);
      this.player.body.setSize(this.player.width * 0.7, this.player.height * 0.7, true).setCollideWorldBounds(true);
      this.coin = visuals ? visuals.createCoin(this, 100, 100) : this.add.circle(100, 100, 9, c.colors.coin);
      this.physics.add.existing(this.coin);
      this.coin.body.setCircle(7, (this.coin.width - 14) / 2, (this.coin.height - 14) / 2);
      this.placeCoin();
      this.drones = this.physics.add.group();
      for (let i = 0; i < c.droneCount; i++) this.spawnDrone(i);
      this.arena.attach(this.player, this.drones);
      this.lives = window.CoinDashLives.create(this, { maxLives: startingLives, invulnerabilityMs: c.invulnerabilityMs });
      this.audio = window.CoinDashAudio.create(this);
      this.reactions = new window.CoinDashReactions(this);
      this.missions = new window.CoinDashMissions(this);
      this.powerups = new window.CoinDashPowerups(this);
      this.rage = new window.CoinDashRage(this);
      this.abilities = new window.CoinDashAbilities(this);
      this.scoring = new window.CoinDashScoring(this);
      this.touch = new window.CoinDashTouchControls({ container: el('touch-controls'),
        onStrike: () => this.abilities.strike(this.runTime) });
      const onSpecialCoin = coin => this.collectCoin(coin.x, coin.y, coin.runnerId);
      this.events.on('special-coin', onSpecialCoin);
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys('W,A,S,D', false);
      this.players = new window.CoinDashMultiplayer(this);
      this.combat = new window.CoinDashCombat(this);
      this.nearMiss = new window.CoinDashNearMiss(this);
      for (const runner of this.players.runners) {
        this.physics.add.overlap(runner.player, this.coin, () => {
          if (this.finished || this.paused || runner.out) return;
          this.collectCoin(this.coin.x, this.coin.y, runner.id);
          this.placeCoin();
        });
        this.physics.add.overlap(runner.player, this.drones, (_player, enemy) => this.enemyContact(runner, enemy));
      }
      this.placeCoin();
      // Native settings widgets keep their arrow keys; only the arena suppresses scrolling.
      this.input.keyboard.removeCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'SHIFT', 'ENTER', 'F', 'L']);
      // Phaser receives the event first at window. Cancelling it on #game would
      // make Phaser ignore Space and arrows before they reach its keyboard listener.
      const onArenaKey = event => {
        if (window.CoinDashGameUI.preventsPageScroll(event, window.coinDashUI?.isOpen())) event.preventDefault();
      };
      window.addEventListener('keydown', onArenaKey);
      const ignoresInput = event => window.coinDashUI?.isOpen() || event.target?.isContentEditable || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(event.target?.tagName || '');
      const onRestart = event => { if (!ignoresInput(event)) this.restartRound(); };
      const onPause = event => { if (!ignoresInput(event) && !event.repeat) this.setPaused(!this.paused); };
      const onMode = event => {
        if (ignoresInput(event) || event.repeat) return;
        el('player-count').value = this.config.playerCount === 2 ? '1' : '2';
        this.restartRound();
      };
      this.input.keyboard.on('keydown-R', onRestart);
      this.input.keyboard.on('keydown-P', onPause);
      this.input.keyboard.on('keydown-ESC', onPause);
      this.input.keyboard.on('keydown-M', onMode);
      const onBlur = () => { if (!this.finished) this.setPaused(true); };
      this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.input.keyboard.off('keydown-R', onRestart);
        this.input.keyboard.off('keydown-P', onPause);
        this.input.keyboard.off('keydown-ESC', onPause);
        this.input.keyboard.off('keydown-M', onMode);
        window.removeEventListener('keydown', onArenaKey);
        this.game.events.off(Phaser.Core.Events.BLUR, onBlur);
        this.events.off('special-coin', onSpecialCoin);
        this.combat.destroy();
        this.nearMiss.destroy();
        this.players.destroy();
        this.lives.destroy();
        this.audio.destroy();
        this.abilities.destroy();
        this.scoring.destroy();
        this.touch.destroy();
        this.reactions.destroy();
        this.missions.destroy();
        this.powerups.destroy();
        this.rage.destroy();
        this.arena.destroy();
      });
      el('pause-game').textContent = 'Pause';
      el('pause-game').disabled = false;
      el('game-status').textContent = 'Round started. Collect gold and dodge the swarm!';
      this.updateHud();
      // HUD wrapping, touch controls and browser chrome can resize the parent
      // without a window resize. Keep Phaser's FIT bounds in sync with the arena.
      if (window.ResizeObserver) {
        let resizeFrame = 0;
        const observer = new window.ResizeObserver(() => {
          if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
          resizeFrame = window.requestAnimationFrame(() => {
            resizeFrame = 0;
            this.scale.getParentBounds();
            this.scale.refresh();
          });
        });
        observer.observe(el('game'));
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
          observer.disconnect();
          if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
        });
      }
    }
    isSpawnClear(x, y, radius = 20) { return this.arena.isClear(x, y, radius); }
    getRunners() {
      return this.players ? this.players.getRunners() : [{ id: 'p1', player: this.player, abilities: this.abilities }];
    }
    collectCoin(x, y, runnerId = 'p1') {
      if (this.finished || this.paused) return;
      const runner = this.players?.getRunner(runnerId);
      if (this.players && (!runner || runner.out)) return;
      const result = this.scoring.collect(this.runTime, runnerId);
      this.score = result.total;
      this.players?.record(result.points, runnerId);
      const seconds = this.config.coinBonusSeconds;
      this.round.addTime(seconds * 1000);
      this.reactions.coin(this.runTime, { points: result.points, x, y, bonusSeconds: seconds, runnerId });
      this.missions.coin();
      this.audio.play('coin');
      this.updateHud();
    }
    awardPoints(points, reason, runnerId = 'p1') {
      if (this.finished || this.paused) return 0;
      const runner = this.players?.getRunner(runnerId);
      if (this.players && (!runner || runner.out)) return 0;
      const awarded = this.scoring.award(points, this.runTime);
      this.score = this.scoring.total;
      this.players?.record(awarded, runnerId);
      if (awarded) this.events?.emit('score', awarded, reason, runnerId);
      this.updateHud();
      return awarded;
    }
    enemyContact(runner, enemy) {
      if (this.finished || this.paused || runner.out || enemy.active === false) return;
      this.nearMiss.contact(runner.id, enemy);
      if (this.combat.contact(enemy, runner)) return;
      if (this.powerups.absorbHit(this.runTime, runner.id)) return;
      const hit = this.players.hit(runner, this.runTime);
      if (!hit.damaged) return;
      this.audio.play('hit');
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.cameras.main.shake(90, 0.003);
      this.events.emit('player-hit', { ...hit, runnerId: runner.id });
      if (hit.allOut) this.finish(this.config.playerCount === 2 ? 'Both players are out!' : 'Out of lives!');
      else el('game-status').textContent = hit.dead ? `${runner.id.toUpperCase()} is out — keep going!`
        : `${runner.id.toUpperCase()}: ${hit.remaining} ${hit.remaining === 1 ? 'life' : 'lives'} left — temporary shield active.`;
    }
    spawnDrone(index, type = 'drone') {
      const c = this.config;
      if (this.drones.getLength() >= c.maxDrones) return null;
      const candidates = [{ x: 50, y: 80 }, { x: c.width - 50, y: 80 },
        { x: 50, y: c.height - 50 }, { x: c.width - 50, y: c.height - 50 }];
      const distance = point => Math.min(...this.getRunners().map(runner => Math.hypot(point.x - runner.player.x, point.y - runner.player.y)));
      let position = candidates[index % candidates.length];
      for (let attempt = 0; attempt < 40; attempt++) {
        const next = { x: Phaser.Math.Between(40, c.width - 40), y: Phaser.Math.Between(70, c.height - 40) };
        if (this.isSpawnClear(next.x, next.y, 20) && distance(next) >= 180) { position = next; break; }
      }
      if (distance(position) < 150) {
        position = candidates.reduce((best, point) => distance(point) > distance(best) ? point : best);
      }
      const enemy = window.CoinDashVisuals
        ? window.CoinDashVisuals.createEnemy(this, position.x, position.y, index, type)
        : this.add.rectangle(position.x, position.y, 24, 24, c.colors.drone);
      enemy.setData('type', type);
      enemy.setData('index', index);
      this.drones.add(enemy);
      enemy.body.setSize(enemy.width * 0.72, enemy.height * 0.72, true).setCollideWorldBounds(true).setBounce(1, 1);
      const angle = (35 + index * 105) * Math.PI / 180;
      enemy.body.setVelocity(Math.cos(angle), Math.sin(angle));
      window.CoinDashEnemies?.decorate?.(this, enemy, index, this.level);
      this.setEnemySpeed(enemy);
      return enemy;
    }
    setEnemySpeed(enemy) {
      const c = this.config;
      const levelMultiplier = this.round.speedMultiplier;
      const raw = Number(enemy.getData('speedMultiplier'));
      const typeMultiplier = Number.isFinite(raw) && raw > 0 ? raw : 1;
      const velocity = enemy.body.velocity;
      if (velocity.lengthSq() === 0) velocity.set(1, 1);
      velocity.normalize().scale(c.droneSpeed * levelMultiplier * typeMultiplier);
    }
    placeCoin() {
      const c = this.config;
      const away = (x, y) => this.getRunners().every(runner => Math.hypot(x - runner.player.x, y - runner.player.y) >= 60);
      let x = 40, y = 70, found = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        x = Phaser.Math.Between(35, c.width - 35);
        y = Phaser.Math.Between(65, c.height - 35);
        if (this.isSpawnClear(x, y, 14) && away(x, y)) { found = true; break; }
      }
      if (!found) {
        search: for (let row = 70; row < c.height - 30; row += 30) {
          for (let column = 40; column < c.width - 30; column += 30) {
            if (this.isSpawnClear(column, row, 14) && away(column, row)) {
              x = column; y = row; break search;
            }
          }
        }
      }
      this.coin.setPosition(x, y);
      this.coin.body.reset(x, y);
    }
    update(_time, delta) {
      if (this.finished || this.paused) return;
      const tick = this.round.advance(delta);
      this.runTime = this.round.elapsed;
      this.level = this.round.level;
      if (tick.finished) { this.finish('Round complete!'); return; }
      if (tick.gainedLevels > 0) {
        const gained = tick.gainedLevels;
        this.level = this.round.level;
        this.arena.setLevel(this.level);
        for (let i = 0; i < gained; i++) this.spawnDrone(this.drones.getLength());
        this.drones.getChildren().forEach(enemy => this.setEnemySpeed(enemy));
        window.CoinDashEnemies?.levelChanged?.(this, this.level);
        this.audio.play('level');
        el('game-status').textContent = `Level ${this.level}! The swarm is faster and growing.`;
      }
      this.players.update(this.runTime, delta);
      this.scoring.update(this.runTime);
      this.reactions.update(this.runTime);
      this.missions.update(this.runTime);
      this.powerups.update(this.runTime, delta);
      window.CoinDashEnemies?.update?.(this, delta);
      this.rage.update(this.runTime, delta);
      this.combat.update(this.runTime, delta);
      this.nearMiss.update(this.runTime);
      this.updateHud();
    }
    updateHud() {
      setText('score-value', this.score);
      setText('level-value', String(this.level).padStart(2, '0'));
      setText('time-value', `${this.round.secondsRemaining}s`);
      setText('enemy-value', this.drones.getLength());
      const hint = `LEVEL ${this.level} / ${this.drones.getLength()} CREATURES`;
      if (this.levelHint.text !== hint) this.levelHint.setText(hint);
    }
    setPaused(paused) {
      if (this.finished || this.paused === paused) return;
      this.paused = paused;
      this.round.setPaused(paused);
      this.touch.reset();
      this.players?.setPaused(paused);
      this.combat?.setPaused(paused);
      this.audio.setPaused(paused);
      this.reactions.setPaused(paused);
      if (paused) { this.physics.pause(); this.player.body.setVelocity(0, 0); }
      else this.physics.resume();
      el('pause-game').textContent = paused ? 'Resume' : 'Pause';
      el('game-status').textContent = paused ? 'Paused — press P or Resume to continue.' : 'Back in the arena. Keep collecting!';
    }
    restartRound() { this.scene.restart(); }
    finish(reason) {
      if (this.finished) return;
      this.finished = true;
      // Normal update stops after game over; restore temporary enemy state now.
      this.rage.update(this.runTime, 0);
      this.combat?.finish();
      this.powerups?.finish();
      this.round.finish();
      this.touch.reset();
      this.scoring.finish(this.score, this.level);
      this.physics.pause();
      this.audio.play('gameover');
      this.audio.setPaused(true);
      this.reactions.setPaused(true);
      this.updateHud();
      el('pause-game').disabled = true;
      el('game-status').textContent = `${reason} ${this.score} ${this.score === 1 ? 'point' : 'points'} scored. Reached level ${this.level}. Start a new round to play again.`;
      const c = this.config;
      const summary = this.players?.summary() || `${this.score} points`;
      this.add.rectangle(c.width / 2, c.height / 2, 480, 180, 0x0a1120, 0.96).setDepth(20);
      this.add.text(c.width / 2, c.height / 2,
        `${reason}\n${summary} · Level ${this.level}\nPress R to try again`,
        { font: '24px monospace', color: '#ffffff', align: 'center', lineSpacing: 16 }).setOrigin(0.5).setDepth(21);
    }
  }
  window.coinDashGame = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', width: COIN_DASH.width, height: COIN_DASH.height,
    backgroundColor: COIN_DASH.colors.background,
    physics: { default: 'arcade', arcade: { debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    scene: CoinDash
  });
  const scene = () => window.coinDashGame.scene.getScene('CoinDash');
  window.coinDashUI = window.CoinDashGameUI ? new window.CoinDashGameUI(scene) : null;
  el('round-settings').addEventListener('submit', event => { event.preventDefault(); window.coinDashUI?.close(false); scene().restartRound(); el('game').focus({ preventScroll: true }); });
  el('pause-game').addEventListener('click', () => { const active = scene(); active.setPaused(!active.paused); el('game').focus({ preventScroll: true }); });
})();
