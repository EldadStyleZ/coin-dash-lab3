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
    this.physics.add.overlap(this.player, this.drones, () => this.onDroneContact());
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,R');
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
    this.setupPowerups();
  }

  onDroneContact() {
    if (this.isShielded()) return;
    this.finish('A drone caught you!');
  }

  // Power-ups: a pickup spawns every spawnEvery seconds and despawns after lifetime.
  // Only one effect is active at a time; a new pickup replaces it with a fresh timer.
  // Everything here is rebuilt in create(), and time events are cleared on restart.
  setupPowerups() {
    const p = COIN_DASH.powerups;
    this.powerup = null;  // active effect: { kind, until }
    this.pickup = null;   // uncollected pickup: { kind, expires, view }
    this.shieldGlow = null;
    this.powerupHud = '';
    this.powerupTimer = this.time.addEvent({
      delay: p.spawnEvery * 1000, startAt: (p.spawnEvery - p.firstSpawn) * 1000,
      loop: true, callback: () => this.spawnPowerup()
    });
    this.updaters.push(() => this.updatePowerups());
    this.hudItems.push(() => (this.powerupHud = this.powerup ? `${p.kinds[this.powerup.kind].label} `
      + `${Math.ceil((this.powerup.until - this.time.now) / 1000)}s` : ''));
  }

  spawnPowerup(kind) {
    if (this.finished) return;
    const c = COIN_DASH, p = c.powerups;
    kind = kind || Phaser.Utils.Array.GetRandom(Object.keys(p.kinds));
    let x, y;
    do {
      x = Phaser.Math.Between(30, c.width - 30);
      y = Phaser.Math.Between(74, c.height - 30);
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < p.minPlayerDistance
      || Phaser.Math.Distance.Between(x, y, this.coin.x, this.coin.y) < 40);
    this.removePickup();
    const k = p.kinds[kind];
    const view = this.add.container(x, y, [
      this.add.circle(0, 0, p.radius, k.color).setStrokeStyle(2, 0xffffff, 0.85),
      this.add.text(0, 0, k.letter, { font: 'bold 14px monospace', color: '#ffffff' }).setOrigin(0.5)
    ]);
    this.pickup = { kind, expires: this.time.now + p.lifetime * 1000, view };
  }

  removePickup() {
    if (this.pickup) this.pickup.view.destroy();
    this.pickup = null;
  }

  updatePowerups() {
    const p = COIN_DASH.powerups, now = this.time.now, pickup = this.pickup;
    if (pickup) {
      const left = pickup.expires - now;
      if (left <= 0) this.removePickup();
      else if (Phaser.Math.Distance.Between(pickup.view.x, pickup.view.y, this.player.x, this.player.y)
        < p.radius + 12) {
        this.removePickup();
        this.activatePowerup(pickup.kind);
      } else {
        // Pulse gently, and blink for the last two seconds before despawning.
        pickup.view.setScale(1 + 0.1 * Math.sin(now / 120))
          .setAlpha(left < 2000 && Math.floor(left / 150) % 2 ? 0.3 : 1);
      }
    }
    const active = this.powerup;
    if (!active) return;
    if (now >= active.until) return this.endPowerup();
    if (active.kind === 'speed') this.player.body.velocity.scale(p.speedMultiplier);
    if (active.kind === 'magnet') this.pullCoin();
    if (active.kind === 'shield') {
      this.shieldGlow.setPosition(this.player.x, this.player.y)
        .setAlpha(active.until - now < 1500 && Math.floor(now / 120) % 2 ? 0.3 : 1);
    }
  }

  activatePowerup(kind) {
    const p = COIN_DASH.powerups;
    this.endPowerup();
    this.powerup = { kind, until: this.time.now + p.duration * 1000 };
    if (kind === 'shield') {
      this.shieldGlow = this.add.circle(this.player.x, this.player.y, 22, p.shieldGlow, 0.2)
        .setStrokeStyle(3, p.shieldGlow, 0.9);
    }
  }

  endPowerup() {
    if (this.powerup && this.powerup.kind === 'magnet') this.coin.body.setVelocity(0, 0);
    if (this.shieldGlow) this.shieldGlow.destroy();
    this.powerup = this.shieldGlow = null;
  }

  // Round over: end the effect, clear the pickup and stop spawning.
  stopPowerups() {
    this.endPowerup();
    this.removePickup();
    if (this.powerupTimer) this.time.removeEvent(this.powerupTimer);
    // The HUD freezes when the round ends; drop the stale countdown from it.
    if (this.powerupHud) this.hud.setText(this.hud.text.replace(`   ${this.powerupHud}`, ''));
  }

  isShielded() {
    return !!this.powerup && this.powerup.kind === 'shield' && this.time.now < this.powerup.until;
  }

  // Magnet: steer the coin toward the player while it is within range.
  pullCoin() {
    const p = COIN_DASH.powerups, coin = this.coin, player = this.player;
    const dist = Phaser.Math.Distance.Between(coin.x, coin.y, player.x, player.y);
    if (dist > p.magnetRange || dist < 4) return coin.body.setVelocity(0, 0);
    this.physics.velocityFromRotation(Phaser.Math.Angle.Between(coin.x, coin.y, player.x, player.y),
      p.magnetPull, coin.body.velocity);
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
    this.stopPowerups();
    const c = COIN_DASH;
    this.add.rectangle(c.width / 2, c.height / 2, 460, 150, 0x0a1120, 0.95);
    this.add.text(c.width / 2, c.height / 2,
      `${reason}\n${this.score} coins collected\nPress R to try again`,
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
