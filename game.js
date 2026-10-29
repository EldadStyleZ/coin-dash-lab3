/* global Phaser, COIN_DASH */
class CoinDash extends Phaser.Scene {
  constructor() { super('CoinDash'); }

  create() {
    const c = COIN_DASH;
    this.score = 0;
    this.finished = false;
    // Features push per-frame functions (time, delta) and HUD functions returning text.
    this.updaters = [];
    this.hudItems = [];
    this.deadline = this.time.now + this.getRoundSeconds() * 1000;
    this.physics.world.setBounds(0, 44, c.width, c.height - 44);
    this.add.grid(c.width / 2, c.height / 2, c.width, c.height, 40, 40,
      c.colors.background, 1, 0x24334b, 0.45);
    this.hud = this.add.text(18, 12, '', { font: '18px monospace', color: '#ffffff' });
    this.player = this.add.rectangle(c.width / 2, c.height / 2, 24, 24, c.colors.player);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.coin = this.add.circle(100, 100, 9, c.colors.coin);
    this.physics.add.existing(this.coin);
    this.coin.body.setCircle(9);
    this.placeCoin();
    this.drones = this.physics.add.group();
    const droneSpeed = this.getDroneSpeed();
    for (let i = 0; i < this.getDroneCount(); i++) {
      // Wrap the starting x so more than three drones still start inside the arena.
      const drone = this.add.rectangle(90 + (i * 270) % 700, 100, 26, 26, c.colors.drone);
      this.drones.add(drone);
      drone.body.setCollideWorldBounds(true).setBounce(1, 1);
      const angle = (35 + i * 105) * Math.PI / 180;
      drone.body.setVelocity(Math.cos(angle) * droneSpeed, Math.sin(angle) * droneSpeed);
    }
    this.physics.add.overlap(this.player, this.coin, () => {
      if (this.finished) return;
      this.addScore(1, 'coin');
      this.placeCoin();
    });
    this.physics.add.overlap(this.player, this.drones, () => this.finish('A drone caught you!'));
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,R');
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
    this.setupCombo();
  }

  // Shared helpers: features read tuning and change the score through these.
  // difficultyName lives on the scene instance, so it survives scene.restart().
  getDifficulty() {
    const d = COIN_DASH.difficulty;
    return d[this.difficultyName] || d[d.default];
  }

  getDroneSpeed() { return COIN_DASH.droneSpeed * this.getDifficulty().droneSpeed; }

  getDroneCount() {
    return Math.max(1, Math.round(COIN_DASH.droneCount * this.getDifficulty().droneCount));
  }

  getRoundSeconds() {
    return Math.round(COIN_DASH.roundSeconds * this.getDifficulty().roundSeconds);
  }

  addScore(points, reason) {
    this.score += points;
    this.events.emit('score', points, reason);
  }

  placeCoin() {
    const c = COIN_DASH;
    // Avoid spawning the next coin directly underneath the player.
    let x, y;
    do {
      x = Phaser.Math.Between(25, c.width - 25);
      y = Phaser.Math.Between(70, c.height - 25);
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 60);
    this.coin.setPosition(x, y);
    this.coin.body.reset(x, y);
  }

  // Combo: coins collected within the window raise a capped multiplier.
  setupCombo() {
    this.combo = 1;
    this.comboUntil = 0;
    // Only 'coin' counts, so the bonus addScore(..., 'combo') cannot retrigger it.
    const onScore = (points, reason) => { if (reason === 'coin') this.onComboCoin(); };
    this.events.on('score', onScore);
    // this.events survives scene.restart(); drop the listener so it doesn't stack.
    this.events.once('shutdown', () => this.events.off('score', onScore));
    this.updaters.push(() => this.updateCombo());
    this.hudItems.push(() => this.comboHud());
  }

  onComboCoin() {
    const cfg = COIN_DASH.combo;
    const now = this.time.now;
    this.combo = now < this.comboUntil ? Math.min(this.combo + 1, cfg.maxMultiplier) : 1;
    this.comboUntil = now + cfg.windowMs;
    if (this.combo > 1) {
      this.addScore(this.combo - 1, 'combo');
      this.showComboPopup(this.combo);
    }
  }

  updateCombo() {
    if (this.combo > 1 && this.time.now >= this.comboUntil) this.combo = 1;
  }

  comboHud() {
    if (this.combo <= 1) return '';
    const { windowMs, barLength } = COIN_DASH.combo;
    const left = Math.max(0, this.comboUntil - this.time.now) / windowMs;
    const filled = Math.ceil(left * barLength);
    // Bar of filled/empty blocks (U+25AE/U+25AF) shows the window left.
    return `Combo x${this.combo} ${'\u25ae'.repeat(filled)}${'\u25af'.repeat(barLength - filled)}`;
  }

  showComboPopup(points) {
    const cfg = COIN_DASH.combo;
    // The coin hasn't been moved yet when the 'score' event fires, so pop up at it.
    const popup = this.add.text(this.coin.x, this.coin.y - 14, `+${points}`, {
      font: 'bold 18px monospace', color: cfg.colors.popup,
      stroke: cfg.colors.popupStroke, strokeThickness: 4
    }).setOrigin(0.5);
    this.tweens.add({
      targets: popup, y: popup.y - cfg.popupRise, alpha: 0, duration: cfg.popupMs,
      onComplete: () => popup.destroy()
    });
  }

  update(time, delta) {
    if (this.finished) return;
    const dx = Number(this.cursors.right.isDown || this.keys.D.isDown)
      - Number(this.cursors.left.isDown || this.keys.A.isDown);
    const dy = Number(this.cursors.down.isDown || this.keys.S.isDown)
      - Number(this.cursors.up.isDown || this.keys.W.isDown);
    const direction = new Phaser.Math.Vector2(dx, dy).normalize().scale(COIN_DASH.playerSpeed);
    this.player.body.setVelocity(direction.x, direction.y);
    this.updaters.forEach(fn => fn(time, delta));
    if (this.finished) return;
    const seconds = Math.max(0, Math.ceil((this.deadline - this.time.now) / 1000));
    const extras = this.hudItems.map(fn => fn()).filter(Boolean);
    this.hud.setText(extras.length
      ? [`Coins: ${this.score}`, `Time: ${seconds}s`, ...extras].join('   ')
      : `Coins: ${this.score}                       Time: ${seconds}s`);
    if (seconds === 0) this.finish('Time is up!');
  }

  finish(reason) {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    const c = COIN_DASH;
    this.add.rectangle(c.width / 2, c.height / 2, 460, 150, 0x0a1120, 0.95);
    this.add.text(c.width / 2, c.height / 2,
      `${reason}\n${this.score} points\nPress R to try again`,
      { font: '24px monospace', color: '#ffffff', align: 'center', lineSpacing: 12 }
    ).setOrigin(0.5);
  }
}
window.coinDashGame = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: COIN_DASH.width,
  height: COIN_DASH.height,
  backgroundColor: COIN_DASH.colors.background,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  scene: CoinDash
});
