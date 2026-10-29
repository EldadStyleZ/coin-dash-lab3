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
    this.spawnEnemies();
    this.setupDash();
    this.physics.add.overlap(this.player, this.coin, () => {
      if (this.finished) return;
      this.addScore(1, 'coin');
      this.placeCoin();
    });
    this.physics.add.overlap(this.player, this.drones, (player, enemy) => this.onEnemyHit(enemy));
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,R');
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
    this.setupDifficulty();
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

  // Enemy types (COIN_DASH.enemyTypes): chasers home in, patrollers pace a line, zippers bounce.
  spawnEnemies() {
    const order = COIN_DASH.enemyTypes.order;
    for (let i = 0; i < this.getDroneCount(); i++) this.spawnEnemy(order[i % order.length]);
    this.updaters.push((time, delta) => this.updateEnemies(delta));
  }

  spawnEnemy(type) {
    const t = COIN_DASH.enemyTypes[type], s = t.size, b = this.physics.world.bounds;
    const { x, y } = this.findEnemySpot();
    const axis = Math.random() < 0.5 ? 'x' : 'y';
    const enemy = type === 'chaser' ? this.add.triangle(x, y, 0, s, s / 2, 0, s, s, t.color)
      : type === 'zipper' ? this.add.star(x, y, 4, s / 5, s / 2, t.color)
      : this.add.rectangle(x, y, axis === 'x' ? s : s * 0.6, axis === 'x' ? s * 0.6 : s, t.color)
        .setStrokeStyle(2, 0xffffff, 0.7);
    this.drones.add(enemy);
    enemy.setData({ type, speedMultiplier: t.speed });
    enemy.body.setCollideWorldBounds(true).setBounce(1, 1);
    const speed = this.getEnemySpeed(enemy);
    if (type === 'zipper') {
      enemy.body.setSize(s * 0.7, s * 0.7, true);
      // Roughly diagonal, so it ricochets around the whole arena.
      const angle = 45 + 90 * Phaser.Math.Between(0, 3) + Phaser.Math.Between(-15, 15);
      this.physics.velocityFromAngle(angle, speed, enemy.body.velocity);
    } else if (type === 'patroller') {
      // Pace a line of `range` px through the spawn point, kept inside the arena.
      const edge = (axis === 'x' ? enemy.width : enemy.height) / 2;
      const lo = (axis === 'x' ? b.left : b.top) + edge, hi = (axis === 'x' ? b.right : b.bottom) - edge;
      enemy.setData({ axis, min: Math.max(lo, enemy[axis] - t.range / 2),
        max: Math.min(hi, enemy[axis] + t.range / 2) });
      enemy.body.velocity[axis] = Math.random() < 0.5 ? speed : -speed;
    }
    return enemy;
  }

  // Random arena point at least spawnDistance away from the player.
  findEnemySpot() {
    const b = this.physics.world.bounds, min = COIN_DASH.enemyTypes.spawnDistance;
    let x, y, tries = 0;
    do {
      x = Phaser.Math.Between(b.left + 30, b.right - 30);
      y = Phaser.Math.Between(b.top + 30, b.bottom - 30);
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < min && ++tries < 50);
    return { x, y };
  }

  getEnemySpeed(enemy) { return this.getDroneSpeed() * (enemy.getData('speedMultiplier') || 1); }

  updateEnemies(delta) {
    this.drones.getChildren().forEach(e => {
      const type = e.getData('type'), speed = this.getEnemySpeed(e);
      if (type === 'chaser') {
        this.physics.moveToObject(e, this.player, speed);
        e.rotation = e.body.velocity.angle() + Math.PI / 2;
      } else if (type === 'patroller') {
        const axis = e.getData('axis');
        if (e[axis] <= e.getData('min')) e.body.velocity[axis] = speed;
        else if (e[axis] >= e.getData('max')) e.body.velocity[axis] = -speed;
      } else if (type === 'zipper') {
        e.rotation += delta * 0.012;
      }
    });
  }

  // Dashing through an enemy destroys it for points; any other contact ends the round.
  onEnemyHit(enemy) {
    if (this.finished || !enemy.active) return;
    const type = enemy.getData('type'), cfg = COIN_DASH.enemyTypes;
    if (!this.dash.active) {
      this.finish(`A ${type} caught you!`);
      return;
    }
    this.addScore(cfg[type].points, `enemy-${type}`);
    this.showPopup(enemy.x, enemy.y, `+${cfg[type].points}`, cfg[type].color);
    enemy.destroy();
    // Respawn later, away from the player, so the arena never empties out.
    this.time.delayedCall(cfg.respawnMs, () => {
      if (this.finished) return;
      const fresh = this.spawnEnemy(type);
      this.tweens.add({ targets: fresh, alpha: { from: 0, to: 1 }, duration: 400 });
    });
  }

  showPopup(x, y, text, color) {
    const label = this.add.text(x, y, text, {
      font: 'bold 18px monospace', color: `#${color.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.tweens.add({ targets: label, y: y - 32, alpha: 0, duration: COIN_DASH.enemyTypes.popupMs,
      onComplete: () => label.destroy() });
  }

  // Space dash (COIN_DASH.dash): a short burst in the movement/facing direction, then a cooldown.
  setupDash() {
    this.dash = { active: false, queued: false, until: 0, readyAt: 0, now: 0,
      dir: new Phaser.Math.Vector2(1, 0) };
    // A 'down' event catches taps shorter than a frame, which JustDown can miss.
    // The keyboard plugin destroys its keys (and their listeners) on shutdown.
    this.input.keyboard.addKey('SPACE').on('down', () => { this.dash.queued = true; });
    this.updaters.push(time => this.updateDash(time));
    this.hudItems.push(() => this.dashHudText());
  }

  updateDash(time) {
    const d = this.dash, cfg = COIN_DASH.dash, v = this.player.body.velocity;
    d.now = time;
    if (!d.active && v.lengthSq() > 0) d.dir.copy(v).normalize();
    const pressed = d.queued;
    d.queued = false;
    if (pressed && !d.active && time >= d.readyAt) {
      d.active = true;
      d.until = time + cfg.durationMs;
      d.readyAt = d.until + cfg.cooldownMs;
      d.color = this.player.fillColor;
      this.player.setFillStyle(cfg.color);
    }
    if (d.active && time >= d.until) {
      d.active = false;
      this.player.setFillStyle(d.color);
    }
    if (!d.active) return;
    this.player.body.setVelocity(d.dir.x * cfg.speed, d.dir.y * cfg.speed);
    // Fading afterimages make the dash easy to see.
    const ghost = this.add.rectangle(this.player.x, this.player.y,
      this.player.width, this.player.height, cfg.color, 0.4);
    this.tweens.add({ targets: ghost, alpha: 0, duration: cfg.trailMs, onComplete: () => ghost.destroy() });
  }

  dashHudText() {
    const d = this.dash, left = d.readyAt - d.now;
    if (d.active) return 'DASH!';
    return left > 0 ? `Dash ${(left / 1000).toFixed(1)}s` : 'Dash ready';
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
    if (this.finished || this.difficultyMenuOpen) return;
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
      `${reason}\n${this.score} coins collected\nPress R to try again`,
      { font: '24px monospace', color: '#ffffff', align: 'center', lineSpacing: 12 }
    ).setOrigin(0.5);
    this.showDifficultyHint();
  }

  // Difficulty start screen. difficultyMenuOpen lives on the scene instance like
  // difficultyName: undefined on first load, so the menu shows before the first round.
  setupDifficulty() {
    const kb = this.input.keyboard;
    this.difficultyMenuOpen = this.difficultyMenuOpen !== false;
    // Hold the round while choosing: no physics (drones, collisions) and no scene timers.
    this.time.paused = this.difficultyMenuOpen;
    this.hudItems.push(() => `${this.difficultyLabel()} mode`);
    kb.on(`keydown-${COIN_DASH.difficultyMenu.key}`, () => {
      if (!this.difficultyMenuOpen) this.returnToDifficultyMenu();
    });
    // Digit keys (top row or numpad) pick the options in menu order.
    kb.on('keydown', event => {
      const name = this.difficultyNames()[Number(event.key) - 1];
      if (this.difficultyMenuOpen && name) this.pickDifficulty(name);
    });
    if (this.difficultyMenuOpen) this.drawDifficultyMenu();
  }

  difficultyNames() {
    const d = COIN_DASH.difficulty;
    return Object.keys(d).filter(name => typeof d[name] === 'object');
  }

  difficultyLabel(name = this.difficultyName || COIN_DASH.difficulty.default) {
    return name[0].toUpperCase() + name.slice(1);
  }

  // Describe an option through the shared helpers so the menu matches the round.
  difficultySummary(name) {
    const current = this.difficultyName;
    this.difficultyName = name;
    const speed = Math.round(this.getDroneSpeed() / COIN_DASH.droneSpeed * 100);
    const text = `${this.getDroneCount()} drones · ${speed}% speed · ${this.getRoundSeconds()}s`;
    this.difficultyName = current;
    return text;
  }

  pickDifficulty(name) {
    this.difficultyName = name;
    this.difficultyMenuOpen = false;
    this.scene.restart();
  }

  returnToDifficultyMenu() {
    this.difficultyMenuOpen = true;
    this.scene.restart();
  }

  drawDifficultyMenu() {
    const c = COIN_DASH;
    const cx = c.width / 2;
    const current = this.difficultyName || c.difficulty.default;
    this.physics.pause();
    const menu = this.add.container(0, 0).setDepth(100);
    menu.add(this.add.rectangle(cx, c.height / 2, c.width, c.height, 0x0a1120, 0.9));
    menu.add(this.add.text(cx, 90, 'Choose difficulty',
      { font: '30px monospace', color: '#ffffff' }).setOrigin(0.5));
    const names = this.difficultyNames();
    names.forEach((name, i) => {
      const y = 175 + i * 85;
      const stroke = name === current ? c.colors.coin : 0x3a4d6b;
      const card = this.add.rectangle(cx, y, 440, 70, 0x182640).setStrokeStyle(3, stroke)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => card.setStrokeStyle(3, c.colors.player))
        .on('pointerout', () => card.setStrokeStyle(3, stroke))
        .on('pointerdown', () => this.pickDifficulty(name));
      menu.add([card,
        this.add.text(cx, y - 13, `${i + 1}  ${this.difficultyLabel(name)}`,
          { font: '22px monospace', color: '#ffffff' }).setOrigin(0.5),
        this.add.text(cx, y + 15, this.difficultySummary(name),
          { font: '15px monospace', color: '#9fb3d1' }).setOrigin(0.5)]);
    });
    menu.add(this.add.text(cx, 445,
      `Press 1-${names.length} or click to start · ${c.difficultyMenu.keyLabel} returns here`,
      { font: '15px monospace', color: '#9fb3d1' }).setOrigin(0.5));
  }

  // Called from finish(): how to get back to the menu (tap works too).
  showDifficultyHint() {
    const c = COIN_DASH;
    this.add.text(c.width / 2, c.height / 2 + 100,
      `${c.difficultyMenu.keyLabel}: change difficulty (now ${this.difficultyLabel()})`,
      { font: '16px monospace', color: '#9fb3d1', backgroundColor: '#0a1120',
        padding: { x: 10, y: 6 } }
    ).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.returnToDifficultyMenu());
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
