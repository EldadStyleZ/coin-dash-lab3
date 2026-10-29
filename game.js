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
    this.physics.add.overlap(this.player, this.drones, (player, enemy) => this.onDroneContact(enemy));
    this.setupNearMiss();
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,R');
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
    this.setupDifficulty();
    this.setupPowerups();
    this.setupCombo();
  }

  // Shield first; otherwise enemy-types decides (dash kill or end of round).
  onDroneContact(enemy) {
    if (this.isShielded()) return;
    this.onEnemyHit(enemy);
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
    this.stopPowerups();
    const c = COIN_DASH;
    this.add.rectangle(c.width / 2, c.height / 2, 460, 150, 0x0a1120, 0.95);
    this.add.text(c.width / 2, c.height / 2,
      `${reason}\n${this.score} points\nPress R to try again`,
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

  // Near-miss bonus: per-drone state lives on the drone, so restarts and new drones start clean.
  setupNearMiss() {
    this.nearMissCount = 0;
    this.updaters.push(time => this.checkNearMisses(time));
    this.hudItems.push(() => (this.nearMissCount ? `Close calls: ${this.nearMissCount}` : ''));
  }

  // Edge-to-edge gap between two Arcade bodies; -1 when they overlap.
  bodyGap(a, b) {
    const sx = Math.max(a.left - b.right, b.left - a.right);
    const sy = Math.max(a.top - b.bottom, b.top - a.bottom);
    return sx < 0 && sy < 0 ? -1 : Math.hypot(Math.max(0, sx), Math.max(0, sy));
  }

  // Arm when the player gets close; pay out on leaving range, unless the drone was touched.
  // A contact that ends the round stops updaters first, so it never pays.
  checkNearMisses(time) {
    const n = COIN_DASH.nearMiss;
    this.drones.getChildren().forEach(drone => {
      if (!drone.body) return;
      const gap = this.bodyGap(this.player.body, drone.body);
      if (gap > n.distance) {
        if (drone.nearMiss === 'armed') this.awardNearMiss(drone, time);
        this.setNearMiss(drone, null);
      } else if (gap < 0) {
        this.setNearMiss(drone, 'touched');
      } else if (!drone.nearMiss && time >= (drone.nearMissReadyAt || 0)) {
        this.setNearMiss(drone, 'armed');
      }
    });
  }

  setNearMiss(drone, state) {
    if ((drone.nearMiss || null) === state) return;
    drone.nearMiss = state;
    if (!drone.setStrokeStyle) return;
    if (state === 'armed') drone.setStrokeStyle(2, COIN_DASH.nearMiss.outlineColor, 0.8);
    else drone.setStrokeStyle();
  }

  awardNearMiss(drone, time) {
    const n = COIN_DASH.nearMiss;
    drone.nearMissReadyAt = time + n.cooldownMs;
    this.nearMissCount++;
    this.addScore(n.points, 'near-miss');
    // Float up from above the player; near the top wall, drift down from below so it misses the HUD.
    const p = this.player;
    const dir = p.y > 110 ? -1 : 1;
    const y = p.y + dir * 26;
    const x = Phaser.Math.Clamp(p.x, 80, COIN_DASH.width - 80);
    const popup = this.add.text(x, y, `Close call! +${n.points}`,
      { font: 'bold 16px monospace', color: n.popupColor }).setOrigin(0.5);
    this.tweens.add({
      targets: popup, y: y + dir * n.popupRise, alpha: 0, duration: n.popupMs,
      onComplete: () => popup.destroy()
    });
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
