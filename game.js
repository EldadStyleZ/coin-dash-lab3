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
    this.setupMultiplayer();
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
    const c = COIN_DASH;
    this.add.rectangle(c.width / 2, c.height / 2, 460, 150, 0x0a1120, 0.95);
    const summary = this.twoPlayer ? this.multiplayerSummary() : `${this.score} coins collected`;
    this.add.text(c.width / 2, c.height / 2,
      `${reason}\n${summary}\nPress R to try again`,
      { font: '24px monospace', color: '#ffffff', align: 'center', lineSpacing: 12 }
    ).setOrigin(0.5);
  }

  // Local multiplayer. twoPlayer lives on the scene instance, so it survives scene.restart().
  // In 2P, P1 (this.player) uses WASD and P2 uses arrows. A drone knocks out only the player
  // it touches (greyed, frozen, score kept); the round ends when both are out or time is up.
  setupMultiplayer() {
    this.mpPlayers = [];
    this.player2 = null;
    this.input.keyboard.on('keydown-M', () => this.toggleMultiplayer());
    this.hudItems.push(() => this.multiplayerHud());
    if (!this.twoPlayer) return;
    const m = COIN_DASH.multiplayer;
    this.player.body.reset(...m.p1Start);
    this.player2 = this.add.rectangle(...m.p2Start, 24, 24, m.p2Color);
    this.physics.add.existing(this.player2);
    this.player2.body.setCollideWorldBounds(true);
    const k = this.keys;
    this.mpPlayers = [
      { id: 'p1', label: 'P1', hint: 'WASD', color: COIN_DASH.colors.player, sprite: this.player,
        keys: { up: k.W, down: k.S, left: k.A, right: k.D } },
      { id: 'p2', label: 'P2', hint: 'arrows', color: m.p2Color, sprite: this.player2,
        keys: this.cursors }
    ];
    // Swap the base player's coin/drone overlaps for per-player ones (update() flushes pending).
    this.physics.world.colliders.update()
      .filter(o => o.object1 === this.player && (o.object2 === this.coin || o.object2 === this.drones))
      .forEach(o => o.destroy());
    this.mpPlayers.forEach(p => {
      Object.assign(p, { score: 0, out: false });
      this.physics.add.overlap(p.sprite, this.coin, () => this.collectCoinFor(p));
      this.physics.add.overlap(p.sprite, this.drones, () => this.knockOut(p));
    });
    this.placeCoinAwayFromPlayers();
    this.showPlayerHints();
    this.updaters.push(() => this.moveMultiplayer());
  }

  toggleMultiplayer() {
    this.twoPlayer = !this.twoPlayer;
    this.scene.restart();
  }

  // Runs after the base movement, so each player follows only its own keys.
  moveMultiplayer() {
    this.mpPlayers.forEach(p => {
      if (p.out) return;
      const k = p.keys;
      const dx = Number(k.right.isDown) - Number(k.left.isDown);
      const dy = Number(k.down.isDown) - Number(k.up.isDown);
      const direction = new Phaser.Math.Vector2(dx, dy).normalize().scale(COIN_DASH.playerSpeed);
      p.sprite.body.setVelocity(direction.x, direction.y);
    });
  }

  collectCoinFor(p) {
    if (this.finished) return;
    p.score += 1;
    this.addScore(1, `coin-${p.id}`);
    this.placeCoinAwayFromPlayers();
  }

  // placeCoin() already keeps clear of P1 (this.player); also keep clear of P2.
  placeCoinAwayFromPlayers() {
    do {
      this.placeCoin();
    } while (Phaser.Math.Distance.Between(this.coin.x, this.coin.y,
      this.player2.x, this.player2.y) < 60);
  }

  knockOut(p) {
    if (p.out || this.finished) return;
    const m = COIN_DASH.multiplayer;
    p.out = true;
    p.sprite.body.stop();
    p.sprite.body.enable = false;
    p.sprite.setFillStyle(m.outColor).setAlpha(m.outAlpha);
    if (this.mpPlayers.every(q => q.out)) this.finish('Both players were caught!');
  }

  // Colour-coded control hints above each player, fading out shortly after the start.
  showPlayerHints() {
    const hints = this.mpPlayers.map(p => this.add.text(p.sprite.x, p.sprite.y - 28,
      `${p.label}: ${p.hint}`,
      { font: '14px monospace', color: `#${p.color.toString(16).padStart(6, '0')}` }
    ).setOrigin(0.5));
    this.tweens.add({ targets: hints, alpha: 0, duration: 400,
      delay: COIN_DASH.multiplayer.hintSeconds * 1000,
      onComplete: () => hints.forEach(t => t.destroy()) });
  }

  multiplayerHud() {
    if (!this.twoPlayer) return '1P (M: 2P)';
    const scores = this.mpPlayers.map(p => `${p.label}: ${p.score}${p.out ? ' out' : ''}`);
    return `${scores.join('  ')}  2P (M: 1P)`;
  }

  multiplayerSummary() {
    const [p1, p2] = this.mpPlayers;
    const best = p1.score > p2.score ? p1 : p2;
    const result = p1.score === p2.score ? 'Draw!' : `${best.label} wins!`;
    return `P1: ${p1.score}  P2: ${p2.score}  ${result}`;
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
