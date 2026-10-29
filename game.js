/* global Phaser, COIN_DASH */
class CoinDash extends Phaser.Scene {
  constructor() { super('CoinDash'); }

  create() {
    const c = COIN_DASH;
    this.score = 0;
    this.finished = false;
    // Features push per-frame functions (time, delta) and HUD functions returning text.
    // hudHeader items share the first HUD line with score and time; hudItems fill the second.
    this.updaters = [];
    this.hudHeader = [];
    this.hudItems = [];
    this.deadline = this.time.now + this.getRoundSeconds() * 1000;
    this.physics.world.setBounds(0, 44, c.width, c.height - 44);
    this.add.grid(c.width / 2, c.height / 2, c.width, c.height, 40, 40,
      c.colors.background, 1, 0x24334b, 0.45);
    // Two lines that fit the 44px band above the arena.
    this.hud = this.add.text(18, 4, '', { font: '15px monospace', color: '#ffffff', lineSpacing: 4 });
    this.player = this.add.rectangle(c.width / 2, c.height / 2, 24, 24, c.colors.player);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.coin = this.add.circle(100, 100, 9, c.colors.coin);
    this.physics.add.existing(this.coin);
    this.coin.body.setCircle(9);
    this.placeCoin();
    this.drones = this.physics.add.group();
    this.physics.add.overlap(this.player, this.coin, () => {
      if (this.finished) return;
      this.addScore(1, 'coin');
      this.placeCoin();
    });
    this.physics.add.overlap(this.player, this.drones, (player, enemy) => this.onDroneContact(enemy));
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,R');
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
    // Updaters run in push order: base movement (update) -> 2P override -> Speed scale ->
    // dash override; shots, close calls and combo then see the final movement.
    this.setupDifficulty();
    this.setupMultiplayer(); // swaps the overlaps above in 2P, so enemies spawn clear of both
    this.spawnEnemies();
    this.setupPowerups();
    this.setupDash();
    this.setupShooting();
    this.setupSound();
    this.setupNearMiss();
    this.setupCombo();
  }

  // The one enemy-contact path: shield, then dash kill, then a 2P knock-out or the end of
  // the round. Shield and dash belong to P1 (this.player); P2 is always knocked out.
  onDroneContact(enemy, player = this.player) {
    if (player === this.player && this.isShielded()) return;
    this.onEnemyHit(enemy, player);
  }

  // Players still in play: P1 alone in 1P, or those not knocked out in 2P.
  activePlayers() {
    return this.twoPlayer ? this.mpPlayers.filter(p => !p.out).map(p => p.sprite) : [this.player];
  }

  p1InPlay() { return this.activePlayers().includes(this.player); }

  // In 2P the P1-only extras (dash, power-ups) are labelled in the HUD.
  p1Tag() { return this.twoPlayer ? 'P1 ' : ''; }

  // Power-ups: a pickup spawns every spawnEvery seconds and despawns after lifetime.
  // Only one effect is active at a time; a new pickup replaces it with a fresh timer.
  // Everything here is rebuilt in create(), and time events are cleared on restart.
  setupPowerups() {
    const p = COIN_DASH.powerups;
    this.powerup = null;  // active effect: { kind, until }
    this.pickup = null;   // uncollected pickup: { kind, expires, view }
    this.shieldGlow = null;
    this.powerupTimer = this.time.addEvent({
      delay: p.spawnEvery * 1000, startAt: (p.spawnEvery - p.firstSpawn) * 1000,
      loop: true, callback: () => this.spawnPowerup()
    });
    this.updaters.push(() => this.updatePowerups());
    this.hudItems.push(() => (this.powerup ? `${this.p1Tag()}${p.kinds[this.powerup.kind].label} `
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
      else if (this.p1InPlay() && Phaser.Math.Distance.Between(pickup.view.x, pickup.view.y,
        this.player.x, this.player.y) < p.radius + 12) {
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
    // finish() redraws the HUD after this, so the ended effect's countdown drops out of it.
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

  // Random arena point at least spawnDistance away from every player in play.
  findEnemySpot() {
    const b = this.physics.world.bounds, min = COIN_DASH.enemyTypes.spawnDistance;
    let x, y, tries = 0;
    do {
      x = Phaser.Math.Between(b.left + 30, b.right - 30);
      y = Phaser.Math.Between(b.top + 30, b.bottom - 30);
    } while (this.activePlayers().some(p => Phaser.Math.Distance.Between(x, y, p.x, p.y) < min)
      && ++tries < 50);
    return { x, y };
  }

  // Chasers home in on the nearest player still in play.
  nearestPlayer(x, y) {
    const d = p => Phaser.Math.Distance.Between(x, y, p.x, p.y);
    return this.activePlayers().sort((a, b) => d(a) - d(b))[0];
  }

  getEnemySpeed(enemy) { return this.getDroneSpeed() * (enemy.getData('speedMultiplier') || 1); }

  updateEnemies(delta) {
    this.drones.getChildren().forEach(e => {
      const type = e.getData('type'), speed = this.getEnemySpeed(e);
      if (type === 'chaser') {
        this.physics.moveToObject(e, this.nearestPlayer(e.x, e.y) || this.player, speed);
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

  // P1 dashing through an enemy destroys it for points; any other contact knocks that
  // player out (2P) or ends the round (1P). Reached through onDroneContact().
  onEnemyHit(enemy, player = this.player) {
    if (this.finished || !enemy.active) return;
    if (!this.dash.active || player !== this.player) {
      if (this.twoPlayer) this.knockOut(this.mpPlayers.find(p => p.sprite === player));
      else this.finish(`A ${enemy.getData('type')} caught you!`);
      return;
    }
    this.destroyEnemy(enemy, 'enemy');
  }

  // Shared kill path (dash: cause 'enemy', shots: 'shot'): per-type points with
  // addScore reason `${cause}-${type}`, a "+N" popup, then a respawn.
  destroyEnemy(enemy, cause) {
    const type = enemy.getData('type'), cfg = COIN_DASH.enemyTypes;
    this.addScore(cfg[type].points, `${cause}-${type}`);
    this.showPopup(enemy.x, enemy.y, `+${cfg[type].points}`, cfg[type].color);
    this.playSfx(this.sliceSound);
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
    if (!this.p1InPlay()) return;
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
    const d = this.dash, left = d.readyAt - d.now, tag = this.p1Tag();
    if (!this.p1InPlay()) return '';
    if (d.active) return `${tag}DASH!`;
    return left > 0 ? `${tag}Dash ${(left / 1000).toFixed(1)}s` : `${tag}Dash ready`;
  }

  // Shooting (COIN_DASH.shooting): hold or tap the fire key; bullets fly in the movement
  // direction (or the dash's facing direction when idle) and destroy enemies they hit.
  setupShooting() {
    this.shot = { queued: false, nextAt: 0 };
    this.bullets = this.physics.add.group();
    // Queue presses from the 'down' event so sub-frame taps still fire (see setupDash).
    this.shot.key = this.input.keyboard.addKey(COIN_DASH.shooting.key);
    this.shot.key.on('down', () => { this.shot.queued = true; });
    this.physics.add.overlap(this.bullets, this.drones, this.onBulletHit, null, this);
    this.updaters.push((time, delta) => this.updateShooting(time, delta));
  }

  updateShooting(time, delta) {
    const s = this.shot, cfg = COIN_DASH.shooting;
    // A tap during the cooldown stays queued, so quick taps fire at the fire rate.
    // Firing on the frame nearest nextAt keeps a held key at exactly fireRateMs.
    // Shots are P1's, so they stop once P1 is knocked out in 2P.
    if (this.p1InPlay() && (s.queued || s.key.isDown) && time + delta / 2 >= s.nextAt) {
      s.queued = false;
      if (this.bullets.countActive() < cfg.maxBullets) {
        this.fireBullet();
        s.nextAt = time + cfg.fireRateMs;
      }
    }
    // Remove bullets that left the arena (also any spawned past a wall). The body is
    // already stepped this frame, so they go before being drawn outside it.
    const b = this.physics.world.bounds;
    this.bullets.getChildren().slice().forEach(bullet => {
      if (!b.contains(bullet.body.center.x, bullet.body.center.y)) bullet.destroy();
    });
  }

  // Held movement keys as a normalised 8-way vector, zero when idle. In 2P only P1's
  // WASD count, so P2's arrows never aim P1's shots.
  getMoveInput() {
    const c = this.twoPlayer ? this.mpPlayers[0].keys : this.cursors, k = this.keys;
    return new Phaser.Math.Vector2(
      Number(c.right.isDown || k.D.isDown) - Number(c.left.isDown || k.A.isDown),
      Number(c.down.isDown || k.S.isDown) - Number(c.up.isDown || k.W.isDown)).normalize();
  }

  fireBullet() {
    const cfg = COIN_DASH.shooting, dir = this.getMoveInput();
    if (dir.lengthSq() === 0) dir.copy(this.dash.dir);
    const x = this.player.x + dir.x * cfg.spawnOffset, y = this.player.y + dir.y * cfg.spawnOffset;
    const bullet = this.add.circle(x, y, cfg.bulletRadius, cfg.bulletColor);
    this.bullets.add(bullet);
    bullet.body.setCircle(cfg.bulletRadius);
    bullet.body.setVelocity(dir.x * cfg.bulletSpeed, dir.y * cfg.bulletSpeed);
    // Short muzzle flash at the spawn point.
    const flash = this.add.circle(x, y, cfg.bulletRadius * 2, 0xffffff, 0.8);
    this.tweens.add({ targets: flash, scale: 1.8, alpha: 0, duration: cfg.flashMs,
      onComplete: () => flash.destroy() });
    this.playSfx(this.shotSound);
  }

  // Sound effects are synthesised with Web Audio, so there are no files to load. They go
  // through Phaser's sound manager, which unlocks audio on the first input and owns mute.
  setupSound() {
    const key = this.input.keyboard.addKey(COIN_DASH.sound.muteKey);
    key.on('down', () => { this.sound.mute = !this.sound.mute; });
  }

  // Plays fn(context, destination, startTime); silently skipped while muted or locked.
  playSfx(fn) {
    const ctx = this.sound.context;
    if (!ctx || this.sound.mute) return;
    if (ctx.state !== 'running') { ctx.resume(); return; }
    fn.call(this, ctx, this.sound.destination, ctx.currentTime);
  }

  // Short "pew": a square wave dropping from 880 Hz to 220 Hz.
  shotSound(ctx, out, t) {
    const osc = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.09);
    filter.type = 'lowpass';
    filter.frequency.value = 2800;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(COIN_DASH.sound.shotVolume, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(filter).connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  // Ninja slice: a rising noise "swish" for the blade, then a bright metallic "shing".
  sliceSound(ctx, out, t) {
    const v = COIN_DASH.sound.sliceVolume;
    const noise = ctx.createBufferSource(), band = ctx.createBiquadFilter(), swish = ctx.createGain();
    noise.buffer = this.getNoiseBuffer(ctx);
    band.type = 'bandpass';
    band.Q.value = 1.5;
    band.frequency.setValueAtTime(900, t);
    band.frequency.exponentialRampToValueAtTime(7000, t + 0.12);
    swish.gain.setValueAtTime(0.0001, t);
    swish.gain.exponentialRampToValueAtTime(v, t + 0.04);
    swish.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    noise.connect(band).connect(swish).connect(out);
    noise.start(t);
    noise.stop(t + 0.2);
    // Two inharmonic partials ring like a blade just after the cut.
    [3150, 4730].forEach((freq, i) => {
      const osc = ctx.createOscillator(), ring = ctx.createGain(), at = t + 0.07;
      osc.frequency.setValueAtTime(freq, at);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.94, at + 0.35);
      ring.gain.setValueAtTime(0.0001, at);
      ring.gain.exponentialRampToValueAtTime(v * (i ? 0.25 : 0.4), at + 0.004);
      ring.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      osc.connect(ring).connect(out);
      osc.start(at);
      osc.stop(at + 0.36);
    });
  }

  // Half a second of white noise, made once per audio context.
  getNoiseBuffer(ctx) {
    if (!ctx.coinDashNoise) {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate / 2), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      ctx.coinDashNoise = buffer;
    }
    return ctx.coinDashNoise;
  }

  onBulletHit(bullet, enemy) {
    if (this.finished || !bullet.active || !enemy.active) return;
    bullet.destroy();
    this.destroyEnemy(enemy, 'shot');
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
    // Only coins count ('coin', or 'coin-p1'/'coin-p2' in 2P), so the bonus
    // addScore(..., 'combo') cannot retrigger it.
    const onScore = (points, reason) => { if (/^coin(-|$)/.test(reason)) this.onComboCoin(); };
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
    this.drawHud();
    if (this.secondsLeft() === 0) this.finish('Time is up!');
  }

  secondsLeft() { return Math.max(0, Math.ceil((this.deadline - this.time.now) / 1000)); }

  // Line 1: score (bonuses included), time and round setup; line 2: feature status.
  drawHud() {
    const texts = items => items.map(fn => fn()).filter(Boolean);
    this.hud.setText([
      [`Score: ${this.score}`, `Time: ${this.secondsLeft()}s`, ...texts(this.hudHeader)].join('   '),
      texts(this.hudItems).join('   ')
    ].join('\n'));
  }

  finish(reason) {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    this.stopPowerups();
    this.drawHud(); // final score, without the ended power-up
    const c = COIN_DASH;
    // 1P: the score. 2P: coins head to head and the winner, then the shared score.
    const lines = this.twoPlayer
      ? [reason, this.multiplayerSummary(), `${this.score} points in total`]
      : [reason, `${this.score} points`];
    lines.push('Press R to try again');
    const height = lines.length * 36 + 40;
    this.add.rectangle(c.width / 2, c.height / 2, 520, height, 0x0a1120, 0.95);
    this.add.text(c.width / 2, c.height / 2, lines.join('\n'),
      { font: '24px monospace', color: '#ffffff', align: 'center', lineSpacing: 12 }
    ).setOrigin(0.5);
    this.showDifficultyHint(c.height / 2 + height / 2 + 24);
  }

  // Difficulty start screen. difficultyMenuOpen lives on the scene instance like
  // difficultyName: undefined on first load, so the menu shows before the first round.
  setupDifficulty() {
    const kb = this.input.keyboard;
    this.difficultyMenuOpen = this.difficultyMenuOpen !== false;
    // Hold the round while choosing: no physics (drones, collisions) and no scene timers.
    this.time.paused = this.difficultyMenuOpen;
    this.hudHeader.push(() => `${this.difficultyLabel()} mode`);
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
    // M works on the menu too (it restarts into the menu), so show which mode is next.
    menu.add(this.add.text(cx, 470,
      `${this.twoPlayer ? '2P' : '1P'} game · M switches to ${this.twoPlayer ? '1P' : '2P'}`,
      { font: '15px monospace', color: '#9fb3d1' }).setOrigin(0.5));
  }

  // Called from finish(), below the end panel: how to get back to the menu (tap works too).
  showDifficultyHint(y = COIN_DASH.height / 2 + 100) {
    const c = COIN_DASH;
    this.add.text(c.width / 2, y,
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
  // A contact that ends the round stops updaters first, so it never pays. Close calls are P1's.
  checkNearMisses(time) {
    const n = COIN_DASH.nearMiss;
    if (!this.p1InPlay()) return;
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
    // Remember the enemy's own outline (patrollers have one) so disarming restores it.
    const base = drone.baseStroke = drone.baseStroke || { on: drone.isStroked,
      width: drone.lineWidth, color: drone.strokeColor, alpha: drone.strokeAlpha };
    if (state === 'armed') drone.setStrokeStyle(2, COIN_DASH.nearMiss.outlineColor, 0.9);
    else if (base.on) drone.setStrokeStyle(base.width, base.color, base.alpha);
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

  // Local multiplayer. twoPlayer lives on the scene instance, so it survives scene.restart().
  // In 2P, P1 (this.player) uses WASD and P2 uses arrows. A drone knocks out only the player
  // it touches (greyed, frozen, score kept); the round ends when both are out or time is up.
  setupMultiplayer() {
    this.mpPlayers = [];
    this.player2 = null;
    this.input.keyboard.on('keydown-M', () => this.toggleMultiplayer());
    this.hudHeader.push(() => this.multiplayerHud());
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
      // Same contact path as 1P (shield and dash apply to P1), ending in knockOut(p).
      this.physics.add.overlap(p.sprite, this.drones,
        (sprite, enemy) => this.onDroneContact(enemy, sprite));
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
    if (p.sprite === this.player) this.endPowerup(); // P1's power-up goes with it
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
