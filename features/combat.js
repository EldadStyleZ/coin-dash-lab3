/* Hila's combat adapted to stationary sword strikes and per-player kill chains. */
(function (root) {
  'use strict';
  const POINTS = { chaser: 5, patroller: 3, zipper: 10 };
  const SHOT_INTERVAL = 250, BULLET_LIFETIME = 1600, RESPAWN_DELAY = 3000, MAX_BULLETS = 8;
  const formTarget = target => target && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName || ''));

  class CoinDashCombat {
    constructor(scene) {
      this.scene = scene;
      this.time = 0;
      this.paused = false;
      this.finished = false;
      this.destroyed = false;
      this.held = new Set();
      this.queued = new Set();
      this.nextShot = new Map();
      this.shots = new Map();
      this.defeated = new WeakSet();
      this.respawns = [];
      this.effects = [];
      this.killChains = new Map();
      this.lastSliceAt = -Infinity;
      this.killStatus = root.document?.getElementById?.('kill-status') || null;
      this.lastStrikeIds = new Map();
      this.reducedMotion = Boolean(root.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      this.listeners = [];
      this.swings = new Map();
      if (scene.events?.on) {
        const onStrike = ({ runnerId = 'p1', strikeId } = {}) => {
          if (!this.active()) return;
          const runner = this.runner(runnerId);
          const ability = runner?.abilities;
          if (!ability || !Number.isSafeInteger(strikeId) || strikeId <= (this.lastStrikeIds.get(runnerId) || 0)
              || strikeId !== ability.strikeId || ability.strikeEndsAt <= this.now()) return;
          this.lastStrikeIds.set(runnerId, strikeId);
          const swing = { id: strikeId, end: ability.strikeEndsAt, kills: 0, direction: { ...ability.strikeDirection } };
          this.swings.set(runnerId, swing);
          this.strikeFeedback(runner, swing);
          this.evaluateStrike(runner, swing);
        };
        scene.events.on('player-strike', onStrike);
        this.listeners.push(() => scene.events.off('player-strike', onStrike));
      }
      this.bullets = scene.physics.add.group();
      this.colliders = [scene.physics.add.overlap(this.bullets, scene.drones, (bullet, enemy) => {
        if (!this.active() || !this.shots.has(bullet) || bullet.active === false) return;
        const owner = this.shots.get(bullet).runnerId;
        if (this.kill(enemy, owner, 'shot')) this.removeBullet(bullet);
      })];
      if (scene.arena?.obstacles) this.colliders.push(scene.physics.add.collider(this.bullets, scene.arena.obstacles,
        bullet => this.removeBullet(bullet)));
      this.renderKillStatus();
      const keyboard = scene.input?.keyboard;
      if (keyboard) for (const [key, id] of [['F', 'p1'], ['L', 'p2']]) {
        const down = event => {
          if (!this.active() || !event || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
              formTarget(event.target) || formTarget(root.document?.activeElement)) return;
          if (!this.runner(id)) return;
          this.held.add(id);
          this.queued.add(id);
        };
        const up = () => this.held.delete(id);
        keyboard.on('keydown-' + key, down);
        keyboard.on('keyup-' + key, up);
        this.listeners.push(() => keyboard.off('keydown-' + key, down), () => keyboard.off('keyup-' + key, up));
      }
    }
    active() { return !this.destroyed && !this.finished && !this.paused && !this.scene.finished && !this.scene.paused; }
    runners() {
      return typeof this.scene.getRunners === 'function' ? this.scene.getRunners()
        : [{ id: 'p1', player: this.scene.player, abilities: this.scene.abilities }];
    }
    runner(id) { return this.runners().find(runner => runner.id === id && runner.player && runner.player.active !== false); }
    now() { return Number.isFinite(this.scene.runTime) && this.scene.runTime >= 0 ? this.scene.runTime : this.time; }
    removeBullet(bullet) {
      if (!this.shots.has(bullet)) return;
      this.shots.delete(bullet);
      if (bullet.scene) bullet.destroy();
    }
    fire(runnerId = 'p1') {
      if (!this.active() || formTarget(root.document?.activeElement)) return false;
      const runner = this.runner(runnerId), time = this.now();
      if (!runner || time < (this.nextShot.get(runnerId) || 0) || this.shots.size >= MAX_BULLETS) return false;
      const velocity = runner.player.body?.velocity;
      const facing = runner.abilities?.lastDirection || { x: 1, y: 0 };
      let dx = velocity && Number.isFinite(velocity.x) ? velocity.x : 0;
      let dy = velocity && Number.isFinite(velocity.y) ? velocity.y : 0;
      if (!Math.hypot(dx, dy)) { dx = facing.x; dy = facing.y; }
      const length = Math.hypot(dx, dy);
      if (!Number.isFinite(length) || !length) { dx = 1; dy = 0; }
      else { dx /= length; dy /= length; }
      const x = runner.player.x + dx * 18, y = runner.player.y + dy * 18;
      if (typeof this.scene.isSpawnClear === 'function' && !this.scene.isSpawnClear(x, y, 4)) return false;
      const bullet = this.scene.add.circle(x, y, 4, runnerId === 'p2' ? 0x7ddcff : 0xb8ff3c);
      this.bullets.add(bullet);
      bullet.body.setCircle(4);
      bullet.body.setVelocity(dx * 520, dy * 520);
      this.shots.set(bullet, { runnerId, expiresAt: time + BULLET_LIFETIME });
      this.nextShot.set(runnerId, time + SHOT_INTERVAL);
      if (!this.reducedMotion) this.addEffect(this.scene.add.circle(x, y, 8, 0xffffff, 0.8), time, 90);
      this.scene.audio?.play?.('shot');
      return true;
    }
    kill(enemy, runnerId, cause, swing = null) {
      if (!this.active() || !enemy || enemy.active === false || !enemy.body || this.defeated.has(enemy)) return false;
      this.defeated.add(enemy);
      const type = enemy.getData('type');
      const points = POINTS[type] || 3;
      const index = enemy.getData('index');
      this.respawns.push({ type, index: Number.isSafeInteger(index) ? index : 0, at: this.now() + RESPAWN_DELAY });
      const x = enemy.x, y = enemy.y;
      // Remove first: simultaneous overlap callbacks must never award twice.
      enemy.destroy();
      this.killFeedback(x, y, points);
      if (this.now() - this.lastSliceAt >= 120) {
        this.lastSliceAt = this.now();
        this.scene.audio?.play?.('slice');
      }
      if (cause === 'shot') this.nextShot.set(runnerId, this.now());
      else if (swing && this.swings.get(runnerId) === swing) {
        swing.kills++;
        this.runner(runnerId)?.abilities.resetStrike(swing.id, this.now());
      }
      this.recordKill(runnerId);
      this.scene.awardPoints?.(points, `${cause}-${type}`, runnerId);
      return true;
    }
    addEffect(object, time, lifetime, rise = 0) {
      object.setDepth?.(6);
      this.effects.push({ object, start: time, end: time + lifetime, y: object.y, rise });
      while (this.effects.length > 48) this.effects.shift().object.destroy();
    }
    killFeedback(x, y, points) {
      const time = this.now();
      const popup = this.scene.add.text(x, y, `+${points}`, { font: 'bold 18px monospace', color: '#ffffff' }).setOrigin(0.5);
      this.addEffect(popup, time, 700, this.reducedMotion ? 0 : 32);
      if (!this.reducedMotion) {
        const slash = this.scene.add.rectangle(x, y, 52, 3, 0xffffff, 1);
        slash.rotation = -Math.PI / 4;
        this.addEffect(slash, time, 140);
      }
    }
    updateEffects(time) {
      this.effects = this.effects.filter(effect => {
        if (!effect.object.scene) return false;
        if (time >= effect.end) { effect.object.destroy(); return false; }
        const progress = (time - effect.start) / (effect.end - effect.start);
        effect.object.setAlpha?.(this.reducedMotion ? 1 : Math.max(0, 1 - progress));
        effect.object.y = effect.y - effect.rise * progress;
        return true;
      });
    }
    strikeFeedback(runner, swing) {
      const direction = swing.direction;
      const angle = Math.atan2(direction.y, direction.x);
      // A visible blade sweep on every attack, without moving or ghosting the runner.
      const x = runner.player.x + Math.cos(angle) * 38;
      const y = runner.player.y + Math.sin(angle) * 38;
      const blade = this.scene.add.rectangle(x, y, 58, 4, runner.id === 'p2' ? 0x9bdeff : 0xffffff, 1);
      blade.rotation = angle + Math.PI / 2;
      this.addEffect(blade, this.now(), 160);
    }
    inStrike(enemy, runner, swing) {
      if (!enemy || enemy.active === false || !enemy.body || enemy.body.enable === false) return false;
      const origin = runner.player.body?.center || runner.player;
      const target = enemy.body.center || enemy;
      const dx = target.x - origin.x, dy = target.y - origin.y;
      const distance = Math.hypot(dx, dy);
      const halfWidth = Number.isFinite(enemy.body.halfWidth) ? enemy.body.halfWidth : (enemy.body.width || 0) / 2;
      const halfHeight = Number.isFinite(enemy.body.halfHeight) ? enemy.body.halfHeight : (enemy.body.height || 0) / 2;
      const radius = Math.max(0, Math.min(24, Math.hypot(halfWidth, halfHeight)));
      if (!Number.isFinite(distance) || distance > 76 + radius) return false;
      const facingLength = Math.hypot(swing.direction.x, swing.direction.y);
      if (!facingLength || !Number.isFinite(facingLength)) return false;
      const angleAllowance = Math.PI / 3 + (distance ? Math.asin(Math.min(1, radius / distance)) : 0);
      if (distance > 0 && (dx * swing.direction.x + dy * swing.direction.y) / (distance * facingLength) < Math.cos(angleAllowance) - 1e-10) return false;
      if (typeof this.scene.isSpawnClear === 'function') {
        const steps = Math.max(1, Math.ceil(distance / 4));
        for (let i = 0; i <= steps; i++) {
          if (!this.scene.isSpawnClear(origin.x + dx * i / steps, origin.y + dy * i / steps, 0)) return false;
        }
      }
      return true;
    }
    evaluateStrike(runner, swing) {
      if (this.now() >= swing.end || runner.abilities.strikeId !== swing.id) return;
      for (const enemy of this.scene.drones.getChildren().slice()) {
        if (this.swings.get(runner.id) !== swing) return;
        if (this.inStrike(enemy, runner, swing)) this.kill(enemy, runner.id, 'enemy', swing);
      }
    }
    contact(enemy, runner) {
      if (!this.active() || !runner || !this.runner(runner.id)) return false;
      const swing = this.swings.get(runner.id);
      if (!swing || this.now() >= swing.end || runner.abilities.strikeId !== swing.id || !this.inStrike(enemy, runner, swing)) return false;
      return this.kill(enemy, runner.id, 'enemy', swing);
    }
    recordKill(id) {
      const now = this.now(), previous = this.killChains.get(id);
      const count = previous && now - previous.last < 2500 ? previous.count + 1 : 1;
      this.killChains.set(id, { count, last: now });
      if ([2, 3, 5].includes(count)) this.scene.reactions?.announce?.(`${id.toUpperCase()} ${count === 2 ? 'DOUBLE KILL!' : count === 3 ? 'TRIPLE KILL!' : count + ' KILL CHAIN!'}`);
      this.renderKillStatus();
    }
    renderKillStatus() {
      if (!this.killStatus) return;
      const text = 'Kill combo · ' + this.runners().map(runner => {
        const count = this.killChains.get(runner.id)?.count || 0;
        return `${runner.id.toUpperCase()}: ${count ? count + ' kill' + (count === 1 ? '' : 's') : 'ready'}`;
      }).join(' · ');
      if (this.killStatus.textContent !== text) this.killStatus.textContent = text;
    }
    update(time, _delta) {
      if (!this.active() || !Number.isFinite(time) || time < this.time || time < 0) return;
      this.time = time;
      for (const [id, swing] of this.swings) {
        if (!this.runner(id)) { this.swings.delete(id); continue; }
        if (time >= swing.end) {
          this.swings.delete(id);
          if (swing.kills === 0) {
            this.killChains.delete(id);
            this.scene.audio?.play?.('whiff');
          }
        } else {
          this.evaluateStrike(this.runner(id), swing);
        }
      }
      for (const [id, chain] of this.killChains) if (!this.runner(id) || time - chain.last >= 2500) this.killChains.delete(id);
      this.renderKillStatus();
      this.updateEffects(time);
      if (formTarget(root.document?.activeElement)) { this.held.clear(); this.queued.clear(); }
      for (const [bullet, shot] of this.shots) {
        if (bullet.active === false || !bullet.body || time >= shot.expiresAt ||
            bullet.x < 16 || bullet.x > 784 || bullet.y < 44 || bullet.y > 484) this.removeBullet(bullet);
      }
      for (const id of new Set([...this.held, ...this.queued])) {
        if (!this.runner(id)) { this.held.delete(id); this.queued.delete(id); continue; }
        if (this.fire(id)) this.queued.delete(id);
      }
      this.respawns = this.respawns.filter(request => {
        if (time < request.at) return true;
        const cap = this.scene.config?.maxDrones || 20;
        if (this.scene.drones.getLength() >= cap) return true;
        return !this.scene.spawnDrone(request.index, request.type);
      });
    }
    setPaused(paused) {
      this.paused = Boolean(paused);
      this.held.clear();
      this.queued.clear();
    }
    finish() {
      if (this.finished) return;
      this.finished = true;
      this.swings.clear();
      this.killChains.clear();
      if (this.killStatus) this.killStatus.textContent = '';
      this.held.clear();
      this.queued.clear();
      this.respawns = [];
      this.effects.splice(0).forEach(effect => { if (effect.object.scene) effect.object.destroy(); });
      for (const bullet of Array.from(this.shots.keys())) this.removeBullet(bullet);
    }
    destroy() {
      if (this.destroyed) return;
      this.finish();
      this.destroyed = true;
      this.listeners.splice(0).forEach(remove => remove());
      for (const collider of this.colliders) if (collider.world) collider.destroy();
      this.colliders = [];
      if (this.bullets.scene) this.bullets.destroy(true);
    }
  }
  root.CoinDashCombat = CoinDashCombat;
})(typeof window !== 'undefined' ? window : globalThis);
