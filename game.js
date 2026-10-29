/* global Phaser, COIN_DASH */
(() => {
  const el = id => document.getElementById(id);
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
    }
  } catch { /* Private browsing or malformed saved settings: use defaults. */ }

  class CoinDash extends Phaser.Scene {
    constructor() { super('CoinDash'); }
    create() {
      const droneCount = clampInteger(el('creature-count').value, COIN_DASH.droneCount, 1, COIN_DASH.maxStartingDrones);
      const selectedLives = Number(el('starting-lives').value);
      const startingLives = [1, 3, 5].includes(selectedLives) ? selectedLives : COIN_DASH.startingLives;
      this.config = { ...COIN_DASH, droneCount, startingLives };
      const c = this.config;
      el('creature-count').value = droneCount;
      try { localStorage.setItem('coin-dash-settings', JSON.stringify({ droneCount, startingLives })); } catch { /* Optional persistence. */ }
      this.score = 0;
      this.level = 1;
      this.runTime = 0;
      this.finished = false;
      this.paused = false;
      this.physics.resume();
      this.physics.world.setBounds(16, 44, c.width - 32, c.height - 60);
      this.add.grid(c.width / 2, c.height / 2, c.width, c.height, 32, 32,
        c.colors.background, 1, 0x24334b, 0.4);
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
      this.lives = window.CoinDashLives.create(this, { maxLives: startingLives, invulnerabilityMs: c.invulnerabilityMs });
      this.audio = window.CoinDashAudio.create(this);
      this.physics.add.overlap(this.player, this.coin, () => {
        if (this.finished || this.paused) return;
        this.score++;
        this.audio.play('coin');
        this.placeCoin();
        this.updateHud();
      });
      this.physics.add.overlap(this.player, this.drones, () => {
        if (this.finished || this.paused) return;
        const hit = this.lives.hit(this.runTime);
        if (!hit.damaged) return;
        this.audio.play('hit');
        this.cameras.main.shake(90, 0.003);
        this.events.emit('player-hit', hit);
        if (hit.dead) this.finish('Out of lives!');
        else el('game-status').textContent = `${hit.remaining} ${hit.remaining === 1 ? 'life' : 'lives'} left — temporary shield active.`;
      });
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys('W,A,S,D');
      const ignoresInput = event => /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(event.target?.tagName || '');
      const onRestart = event => { if (!ignoresInput(event)) this.restartRound(); };
      const onPause = event => { if (!ignoresInput(event) && !event.repeat) this.setPaused(!this.paused); };
      this.input.keyboard.on('keydown-R', onRestart);
      this.input.keyboard.on('keydown-P', onPause);
      this.input.keyboard.on('keydown-ESC', onPause);
      const onBlur = () => { if (!this.finished) this.setPaused(true); };
      this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.input.keyboard.off('keydown-R', onRestart);
        this.input.keyboard.off('keydown-P', onPause);
        this.input.keyboard.off('keydown-ESC', onPause);
        this.game.events.off(Phaser.Core.Events.BLUR, onBlur);
        this.lives.destroy();
        this.audio.destroy();
      });
      el('pause-game').textContent = 'Pause';
      el('pause-game').disabled = false;
      el('game-status').textContent = 'Round started. Collect gold and dodge the swarm!';
      this.updateHud();
    }
    spawnDrone(index, type = 'drone') {
      const c = this.config;
      if (this.drones.getLength() >= c.maxDrones) return null;
      const candidates = [{ x: 50, y: 80 }, { x: c.width - 50, y: 80 },
        { x: 50, y: c.height - 50 }, { x: c.width - 50, y: c.height - 50 }];
      let position = candidates[index % candidates.length];
      for (let attempt = 0; attempt < 40; attempt++) {
        const next = { x: Phaser.Math.Between(40, c.width - 40), y: Phaser.Math.Between(70, c.height - 40) };
        if (Phaser.Math.Distance.Between(next.x, next.y, this.player.x, this.player.y) >= 180) { position = next; break; }
      }
      if (Phaser.Math.Distance.Between(position.x, position.y, this.player.x, this.player.y) < 150) {
        position = candidates.reduce((best, point) =>
          Phaser.Math.Distance.Between(point.x, point.y, this.player.x, this.player.y) >
          Phaser.Math.Distance.Between(best.x, best.y, this.player.x, this.player.y) ? point : best);
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
      const levelMultiplier = Math.min(c.maxSpeedMultiplier, 1 + (this.level - 1) * c.speedStep);
      const raw = Number(enemy.getData('speedMultiplier'));
      const typeMultiplier = Number.isFinite(raw) && raw > 0 ? raw : 1;
      const velocity = enemy.body.velocity;
      if (velocity.lengthSq() === 0) velocity.set(1, 1);
      velocity.normalize().scale(c.droneSpeed * levelMultiplier * typeMultiplier);
    }
    placeCoin() {
      const c = this.config;
      let x = 40, y = 70;
      for (let attempt = 0; attempt < 50; attempt++) {
        x = Phaser.Math.Between(35, c.width - 35);
        y = Phaser.Math.Between(65, c.height - 35);
        if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) >= 60) break;
      }
      this.coin.setPosition(x, y);
      this.coin.body.reset(x, y);
    }
    update(_time, delta) {
      if (this.finished || this.paused) return;
      this.runTime += delta;
      if (this.runTime >= this.config.roundSeconds * 1000) { this.finish('Round complete!'); return; }
      const nextLevel = 1 + Math.floor(this.runTime / (this.config.levelSeconds * 1000));
      if (nextLevel > this.level) {
        const gained = nextLevel - this.level;
        this.level = nextLevel;
        for (let i = 0; i < gained; i++) this.spawnDrone(this.drones.getLength());
        this.drones.getChildren().forEach(enemy => this.setEnemySpeed(enemy));
        window.CoinDashEnemies?.levelChanged?.(this, this.level);
        this.audio.play('level');
        el('game-status').textContent = `Level ${this.level}! The swarm is faster and growing.`;
      }
      const dx = Number(this.cursors.right.isDown || this.keys.D.isDown) - Number(this.cursors.left.isDown || this.keys.A.isDown);
      const dy = Number(this.cursors.down.isDown || this.keys.S.isDown) - Number(this.cursors.up.isDown || this.keys.W.isDown);
      const direction = new Phaser.Math.Vector2(dx, dy).normalize().scale(this.config.playerSpeed);
      this.player.body.setVelocity(direction.x, direction.y);
      this.lives.update(this.runTime);
      window.CoinDashEnemies?.update?.(this, delta);
      this.updateHud();
    }
    updateHud() {
      el('score-value').textContent = this.score;
      el('level-value').textContent = String(this.level).padStart(2, '0');
      el('time-value').textContent = `${Math.max(0, Math.ceil(this.config.roundSeconds - this.runTime / 1000))}s`;
      el('enemy-value').textContent = this.drones.getLength();
      this.levelHint.setText(`LEVEL ${this.level} / ${this.drones.getLength()} CREATURES`);
    }
    setPaused(paused) {
      if (this.finished || this.paused === paused) return;
      this.paused = paused;
      this.audio.setPaused(paused);
      if (paused) { this.physics.pause(); this.player.body.setVelocity(0, 0); }
      else this.physics.resume();
      el('pause-game').textContent = paused ? 'Resume' : 'Pause';
      el('game-status').textContent = paused ? 'Paused — press P or Resume to continue.' : 'Back in the arena. Keep collecting!';
    }
    restartRound() { this.scene.restart(); }
    finish(reason) {
      if (this.finished) return;
      this.finished = true;
      this.physics.pause();
      this.audio.play('gameover');
      this.audio.setPaused(true);
      this.updateHud();
      el('pause-game').disabled = true;
      el('game-status').textContent = `${reason} ${this.score} coins collected. Reached level ${this.level}. Start a new round to play again.`;
      const c = this.config;
      this.add.rectangle(c.width / 2, c.height / 2, 480, 180, 0x0a1120, 0.96).setDepth(20);
      this.add.text(c.width / 2, c.height / 2,
        `${reason}\n${this.score} coins · Level ${this.level}\nPress R to try again`,
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
  el('round-settings').addEventListener('submit', event => { event.preventDefault(); scene().restartRound(); });
  el('pause-game').addEventListener('click', () => { const active = scene(); active.setPaused(!active.paused); });
})();
